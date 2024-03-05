import EventEmitter from "events";
import { Configuration, OpenAIApi } from "openai";
import SSE from "../utils/sse";
import { OpenAIMessage, Parameters } from "./types";
import { backend } from "../backend";

export const defaultModel = 'gpt-3.5-turbo';

export function isProxySupported() {
    console.log(`backend=${backend}`);
    console.log(`backend.current.services=${backend.current?.services}`);

    return !!backend.current?.services?.includes('openai');
}

function shouldUseProxy(apiKey: string | undefined | null) {
    console.log(`apiKey = ${apiKey}`);
    return !apiKey && isProxySupported();
}

function getEndpoint(proxied = false) {
    return 'https://api.openai.com';
}

export interface OpenAIResponseChunk {
    id?: string;
    done: boolean;
    choices?: {
        delta: {
            content: string;
        };
        index: number;
        finish_reason: string | null;
    }[];
    model?: string;
}

function parseResponseChunk(buffer: any): OpenAIResponseChunk {
    const chunk = buffer.toString().replace('data: ', '').trim();

    if (chunk === '[DONE]') {
        return {
            done: true,
        };
    }

    const parsed = JSON.parse(chunk);

    return {
        id: parsed.id,
        done: false,
        choices: parsed.choices,
        model: parsed.model,
    };
}

export async function createChatCompletion(messages: OpenAIMessage[], parameters: Parameters): Promise<string> {
    console.log("createChatCompletion: Starting", { parameters });
    
    const proxied = shouldUseProxy(parameters.apiKey);
    console.log(`Proxied=${proxied}`);
    const endpoint = getEndpoint(proxied);
    console.log(`Endpoint=${endpoint}`);

    console.log(`createChatCompletion: Proxied=${proxied}, Endpoint=${endpoint}`);

    if (!proxied && !parameters.apiKey) {
        console.error("createChatCompletion: No API key provided");
        throw new Error('No API key provided');
    }

    const response = await fetch(endpoint + '/v1/chat/completions', {
        method: "POST",
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': `Bearer ${parameters.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            "model": parameters.model,
            "messages": messages,
            "temperature": parameters.temperature,
        }),
    });

    const data = await response.json();

    console.log("createChatCompletion: Response received", { data });

    return data.choices[0].message?.content?.trim() || '';
}

export async function preprocessMessages(messages) {
    console.log("Preprocessing messages:", messages);
    try {
        const query: string = messages.length > 0 ? messages.map(item => item.content).join('. ') : '';
        console.log(`Received query: ${query}`);
        // Assuming `axios` is available in your client-side environment
        // You might need to replace this with fetch or another HTTP client suitable for your environment

        console.log('query', query);

        const pythonServiceUrl = 'http://localhost:8000'
        const response = await fetch(`${pythonServiceUrl}/create-prompt`, {
            method: "POST",
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "query": query,
            }),
        });
        const data = await response.json();
        console.log("Received response from preprocessing service:", data);
        return [{ role: "user", content: data }];
    } catch (error) {
        console.error("Error during message preprocessing:", error);
        throw new Error('Failed to preprocess messages');
    }
}

export async function createStreamingChatCompletion(messages: OpenAIMessage[], parameters: Parameters) {
    console.log("createStreamingChatCompletion: Starting", { parameters });
    
    const emitter = new EventEmitter();

    const proxied = shouldUseProxy(parameters.apiKey);
    const endpoint = getEndpoint(proxied);

    console.log(`createStreamingChatCompletion: Proxied=${proxied}, Endpoint=${endpoint}`);

    if (!proxied && !parameters.apiKey) {
        console.error("createStreamingChatCompletion: No API key provided");
        throw new Error('No API key provided');
    }

    const eventSource = new SSE(endpoint + '/v1/chat/completions', {
        method: "POST",
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': `Bearer ${parameters.apiKey}`,
            'Content-Type': 'application/json',
        },
        payload: JSON.stringify({
            "model": parameters.model,
            "messages": messages,
            "temperature": parameters.temperature,
            "stream": true,
        }),
    }) as SSE;

    let contents = '';

    eventSource.addEventListener('error', (event: any) => {
        console.error("createStreamingChatCompletion: Error received", event.data);
        if (!contents) {
            let error = event.data;
            try {
                error = JSON.parse(error).error.message;
            } catch (e) {
                console.error("createStreamingChatCompletion: Error parsing", e);
            }
            emitter.emit('error', error);
        }
    });

    console.log("createStreamingChatCompletion: EventSource setup completed");
    eventSource.addEventListener('message', async (event: any) => {
        if (event.data === '[DONE]') {
            emitter.emit('done');
            return;
        }

        try {
            const chunk = parseResponseChunk(event.data);
            if (chunk.choices && chunk.choices.length > 0) {
                contents += chunk.choices[0]?.delta?.content || '';
                emitter.emit('data', contents);
            }
        } catch (e) {
            console.error(e);
        }
    });

    eventSource.stream();

    return {
        emitter,
        cancel: () => eventSource.close(),
    };
}

export const maxTokensByModel = {
    "gpt-3.5-turbo": 4096,
    "gpt-4": 8192,
    "gpt-4-0613": 8192,
    "gpt-4-32k": 32768,
    "gpt-4-32k-0613": 32768,
    "gpt-3.5-turbo-16k": 16384,
    "gpt-3.5-turbo-0613": 4096,
    "gpt-3.5-turbo-16k-0613": 16384,
};
