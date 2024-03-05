import EventEmitter from "events";
import { createChatCompletion, createStreamingChatCompletion, preprocessMessages } from "./openai";
import { PluginContext } from "../plugins/plugin-context";
import { pluginRunner } from "../plugins/plugin-runner";
import { Chat, Message, OpenAIMessage, Parameters, getOpenAIMessageFromMessage } from "./types";
import { EventEmitterAsyncIterator } from "../utils/event-emitter-async-iterator";
import { YChat } from "./y-chat";
import { OptionsManager } from "../options";

export class ReplyRequest extends EventEmitter {
    private mutatedMessages: OpenAIMessage[];
    private mutatedParameters: Parameters;
    private lastChunkReceivedAt: number = 0;
    private timer: any;
    private done: boolean = false;
    private content = '';
    private cancelSSE: any;

    constructor(private chat: Chat,
                private yChat: YChat,
                private messages: Message[],
                private replyID: string,
                private requestedParameters: Parameters,
                private pluginOptions: OptionsManager) {
        super();
        this.mutatedMessages = [...messages];
        this.mutatedMessages = messages.map(m => getOpenAIMessageFromMessage(m));
        this.mutatedParameters = { ...requestedParameters };
        delete this.mutatedParameters.apiKey;
    }

    pluginContext = (pluginID: string) => {
        console.log(`Creating plugin context for pluginID: ${pluginID}`);
        return {
            getOptions: () => {
                const options = this.pluginOptions.getAllOptions(pluginID, this.chat.id);
                console.log(`getOptions called for pluginID ${pluginID}, returning options:`, options);
                return options;
            },
    
            getCurrentChat: () => {
                console.log(`getCurrentChat called, returning chat:`, this.chat);
                return this.chat;
            },
    
            createChatCompletion: async (messages: OpenAIMessage[], _parameters: Parameters) => {
                console.log(`createChatCompletion called with messages:`, messages, `and parameters:`, _parameters);
                const completion = await createChatCompletion(messages, {
                    ..._parameters,
                    apiKey: this.requestedParameters.apiKey,
                });
                console.log(`Chat completion created:`, completion);
                return completion;
            },
    
            setChatTitle: async (title: string) => {
                console.log(`setChatTitle called with title: ${title}`);
                this.yChat.title = title;
            },
        } as PluginContext;
    };
    

    private scheduleTimeout() {
        this.lastChunkReceivedAt = Date.now();
        console.log('Timeout scheduler reset.');
    
        clearInterval(this.timer);
    
        this.timer = setInterval(() => {
            const sinceLastChunk = Date.now() - this.lastChunkReceivedAt;
            if (sinceLastChunk > 30000 && !this.done) {
                console.log(`No response from OpenAI in the last 30 seconds. sinceLastChunk: ${sinceLastChunk}`);
                this.onError('no response from OpenAI in the last 30 seconds');
            }
        }, 2000);
    }

    public async execute() {
        try {
            console.log('Execution started.');
            this.scheduleTimeout();
    
            await pluginRunner("preprocess-model-input", this.pluginContext, async plugin => {
                console.log(`Running plugin: ${plugin.name} for preprocess-model-input`);
                const output = await plugin.preprocessModelInput(this.mutatedMessages, this.mutatedParameters);
                console.log(`Plugin ${plugin.name} output:`, output);
                this.mutatedMessages = output.messages;
                this.mutatedParameters = output.parameters;
                this.lastChunkReceivedAt = Date.now();
            });

            this.mutatedMessages = await preprocessMessages(this.mutatedMessages);
    
            console.log('Creating streaming chat completion.');
            const { emitter, cancel } = await createStreamingChatCompletion(this.mutatedMessages, {
                ...this.mutatedParameters,
                apiKey: this.requestedParameters.apiKey,
            });
            this.cancelSSE = cancel;
    
            const eventIterator = new EventEmitterAsyncIterator<string>(emitter, ["data", "done", "error"]);
            console.log('Event iterator created, listening for events.');
    
            for await (const event of eventIterator) {
                const { eventName, value } = event;
                console.log(`Event received: ${eventName}`, value);
    
                switch (eventName) {
                    case 'data':
                        await this.onData(value);
                        break;
    
                    case 'done':
                        await this.onDone();
                        break;
    
                    case 'error':
                        if (!this.content || !this.done) {
                            await this.onError(value);
                        }
                        break;
                }
            }
        } catch (e: any) {
            console.error(`Error during execution:`, e);
            this.onError(e.message);
        } finally {
            console.log('Execution completed.');
        }
    }
    

    public async onData(value: any) {
        if (this.done) {
            return;
        }

        this.lastChunkReceivedAt = Date.now();

        this.content = value;

        await pluginRunner("postprocess-model-output", this.pluginContext, async plugin => {
            const output = await plugin.postprocessModelOutput({
                role: 'assistant',
                content: this.content,
            }, this.mutatedMessages, this.mutatedParameters, false);

            this.content = output.content;
        });

        this.yChat.setPendingMessageContent(this.replyID, this.content);
    }

    public async onDone() {
        if (this.done) {
            return;
        }
        clearInterval(this.timer);
        this.lastChunkReceivedAt = Date.now();
        this.done = true;
        this.emit('done');

        this.yChat.onMessageDone(this.replyID);

        await pluginRunner("postprocess-model-output", this.pluginContext, async plugin => {
            const output = await plugin.postprocessModelOutput({
                role: 'assistant',
                content: this.content,
            }, this.mutatedMessages, this.mutatedParameters, true);

            this.content = output.content;
        });

        this.yChat.setMessageContent(this.replyID, this.content);
    }

    public async onError(error: string) {
        if (this.done) {
            return;
        }
        this.done = true;
        this.emit('done');
        clearInterval(this.timer);
        this.cancelSSE?.();

        this.content += `\n\nI'm sorry, I'm having trouble connecting to OpenAI (${error || 'no response from the API'}). Please make sure you've entered your OpenAI API key correctly and try again.`;
        this.content = this.content.trim();

        this.yChat.setMessageContent(this.replyID, this.content);
        this.yChat.onMessageDone(this.replyID);
    }

    public onCancel() {
        clearInterval(this.timer);
        this.done = true;
        this.yChat.onMessageDone(this.replyID);
        this.cancelSSE?.();
        this.emit('done');
    }

    // private setMessageContent(content: string) {
    //     const text = this.yChat.content.get(this.replyID);
    //     if (text && text.toString() !== content) {
    //         text?.delete(0, text.length);
    //         text?.insert(0, content);
    //     }
    // }
}