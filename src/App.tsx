import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Observable, Subscriber, Subject } from '@reactivex/rxjs';
import { BotMessage, BotConversation } from './directLineTypes';
import { startConversation, getMessages, postMessage } from './directLine';
import { History } from './History.tsx'
import { Console } from './Console.tsx'

export interface Message {
    from: "me" | "bot",
    text: string
} 

export interface ConsoleState {
    text?: string,
    enableSend?: boolean
}

interface State {
    // conversation metadata
    conversation?: BotConversation,
    // message history
    messages?: Message[],
    // compose window
    console?: ConsoleState
}

const outgoing$ = new Subject<Message>();

const console$ = new Subject<ConsoleState>();
const consoleStart = {text: "", enableSend: true};

const incoming$ = (conversation) =>
    getMessages(conversation)
    .filter(botmessage => botmessage.from === "TestBot");

const message$ = (conversation) =>
    incoming$(conversation)
    .map<Message>(botmessage => ({ text: botmessage.text, from: "bot" }))
    .merge(outgoing$)
    .scan<Message[]>((messages, message) => [...messages, message], []);

const state$ = (conversation) => 
    message$(conversation).startWith([])
    .combineLatest(
        console$.startWith(consoleStart),
        (messages, compose) => ({
            conversation: conversation,
            messages: messages,
            console: compose
        } as State)
    )
    .do(state => console.log("state", state));

const conversation$ = startConversation();

class App extends React.Component<{}, State> {
    constructor() {
        super();
        this.state = {
            conversation: null,
            messages: [],
            console: consoleStart
        }

        conversation$.subscribe(
            conversation => state$(conversation).subscribe(
                state => this.setState(state),
                error => console.log("errors", error)
            ),
            error => console.log("error starting conversation", error)
        )
    }

    private consoleActions = {
        updateMessage: (text: string) => {
            console$.next({text: text, enableSend: this.state.console.enableSend});
        },

        sendMessage: () => {
            console$.next({text: this.state.console.text, enableSend: false});
            postMessage({
                text: this.state.console.text,
                from: null,
                conversationId: this.state.conversation.conversationId
            }, this.state.conversation)
            .retry(2)
            .subscribe(
                () => {
                    outgoing$.next({
                        text: this.state.console.text,
                        from: "me"
                    });
                    console$.next({
                        text: "",
                        enableSend: true
                    });
                },
                error => {
                    console.log("failed to post message");
                    console$.next({text: this.state.console.text, enableSend: true});
                }
            );
        },

        sendFile: (file:string) => {
            console.log("attachment", file);
        }
    }

    render() {
        return <div id="appFrame">
            <Console actions={ this.consoleActions } { ...this.state.console } />
            <History messages={ this.state.messages }/> 
        </div>;
    }
}

ReactDOM.render(<App />, document.getElementById("app"));