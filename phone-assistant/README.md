# Your phone AI assistant: NextChat

This folder gets **NextChat** running so you can use it from your phone.

**Why NextChat?** Of the 121 AI-assistant repositories catalogued by the
explorer in this repo, it is the most-starred chat assistant (about 89k stars),
it is a Progressive Web App that installs on an iPhone or Android home screen
and looks like a native app, it supports Claude, GPT and Gemini with your own
key, and it deploys for free in about a minute. The agent frameworks that
outrank it (LangChain, Langflow) are developer toolkits, not something you chat
with on a phone.

Source: https://github.com/ChatGPTNextWeb/NextChat (MIT licence).

## What you need

1. **An API key** from one provider. Anthropic (Claude) is recommended:
   https://console.anthropic.com/settings/keys. OpenAI or Google Gemini also work.
2. **A password** of your choosing. NextChat calls it `CODE`. It stops strangers
   using your key if they find the URL.

## Option A: Deploy to Vercel (free, recommended, no computer needed)

1. Open this link on any device:
   https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FChatGPTNextWeb%2FNextChat&env=ANTHROPIC_API_KEY,OPENAI_API_KEY,CODE&project-name=nextchat&repository-name=NextChat
2. Sign in to Vercel with GitHub (free account).
3. Fill in `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) and `CODE`. Leave the
   other blank.
4. Click **Deploy**. After about a minute you get a URL like
   `https://nextchat-xxxx.vercel.app`.

## Option B: Run it on a computer with Docker

```bash
cd phone-assistant
cp .env.example .env     # add your key and password
docker compose up -d
```

The app is at `http://localhost:3000`. From your phone on the same Wi-Fi, use
the computer's IP address, e.g. `http://192.168.1.20:3000`.

## Option C: Run it from source without Docker

```bash
cd phone-assistant
cp .env.example .env     # add your key and password
./run-local.sh
```

This clones NextChat, builds it and starts it on port 3000.

## Put it on your phone's home screen

Open your NextChat URL in the phone browser, enter the password when asked, then:

- **iPhone (Safari):** tap the Share button, then **Add to Home Screen**.
- **Android (Chrome):** tap the three-dot menu, then **Install app** or
  **Add to Home screen**.

It now opens full-screen like a normal app, with chat history saved on the
phone.

## Choosing Claude

In the app, tap the model name above the message box and pick a Claude model.
To make it the default, set `DEFAULT_MODEL=claude-sonnet-4-5` (or another
Claude model name) in your environment variables and redeploy.

## Verified build

The `docs/` folder contains screenshots of this exact setup built from the
NextChat `main` branch and loaded at phone size.
