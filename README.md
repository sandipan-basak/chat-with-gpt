# Chat with GPT

Chat with GPT is an open-source, unofficial ChatGPT app with extra features and more ways to customize your experience. It connects ChatGPT with ElevenLabs to give ChatGPT a realistic human voice.

Powered by the new ChatGPT API from OpenAI, this app has been developed using TypeScript + React. We welcome pull requests from the community!

## Features

- 🚀 **Fast** response times.
- 🔎 **Search** through your past chat conversations.
- 📄 View and customize the System Prompt - the **secret prompt** the system shows the AI before your messages.
- 🌡 Adjust the **creativity and randomness** of responses by setting the Temperature setting. Higher temperature means more creativity.
- 💬 Give ChatGPT AI a **realistic human voice** by connecting your ElevenLabs text-to-speech account, or using your browser's built-in text-to-speech.
- 🎤 **Speech recognition** powered by OpenAI Whisper.
- ✉ **Share** your favorite chat sessions online using public share URLs.
- 📋 Easily **copy-and-paste** ChatGPT messages.
- ✏️ Edit your messages
- 🔁 Regenerate ChatGPT messages
- 🖼 **Full markdown support** including code, tables, and math.
- 🫰 Pay for only what you use with the ChatGPT API.

## Bring your own API keys

### OpenAI

To get started with Chat with GPT, you will need to add your OpenAI API key on the settings screen. Click "Connect your OpenAI account to get started" on the home page to begin. Once you have added your API key, you can start chatting with ChatGPT.

Your API key is stored only on your device and is never transmitted to anyone except OpenAI. Please note that OpenAI API key usage is billed at a pay-as-you-go rate, separate from your ChatGPT subscription.

### ElevenLabs

To use the realistic AI text-to-speech feature, you will need to add your ElevenLabs API key by clicking "Play" next to any message.

Your API key is stored only on your device and never transmitted to anyone except ElevenLabs.

## Running on your own computer

To run on your own device, you can use Docker:

```
docker build --no-cache .
```

Then navigate to http://localhost:3000 to view the app.

### Reccomendable usage of API KEY

You can use the API Key on the browser UI.

Create a file called `config.yaml` in your `data` folder with the following contents:

```
services:
  openai:
    apiKey: (your api key)
  elevenlabs:
    apiKey: (your api key)
```

and restart the server. Login is required.