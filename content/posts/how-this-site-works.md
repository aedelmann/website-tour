---
title: "How This Site Actually Works (Hugo, a Tesla API, and an AI That Opens PRs)"
date: 2026-08-16
location: "Jerez de la Frontera, Spain"
latitude: 36.6850
longitude: -6.1261
categories: ["Tech"]
tags: ["hugo", "netlify", "tesla", "ai", "cursor", "grok", "static-site"]
featured_image: "/images/intro/sunset-deck.jpg"
reading_time: 9
---

Picture this: we are sitting in Jerez with a coffee, a Tesla in the driveway, and a travel blog that used to be a pile of handwritten Charge Stats and a map that only knew about places we had already written up. Then we asked an AI to help. A week later the homepage has Supercharger pins from Gorinchem to Málaga, the hero knows whether we are on the road, and About no longer reads like two LinkedIn pages taped to a beach photo.

This is the unglamorous version of how [silentwanderers.com](https://silentwanderers.com) is put together. Not a product pitch. Just the stack, the Tesla bits, and the slightly weird workflow where a bot opens pull requests and we still have to hit merge.

![How Silent Wanderers is put together: Tesla billed history goes through a private Netlify sync into a public JSON snapshot, then onto the Hugo site. Below that, Grok Bot opens a GitHub PR, we preview, then merge.](/images/posts/how-the-site-works.png)

## The boring (good) foundation

The site is a **Hugo** static site. Markdown in, HTML out. It lives on **GitHub** ([aedelmann/website-tour](https://github.com/aedelmann/website-tour)) and **Netlify** builds it and puts it on the custom domain.

That choice is the whole personality of the project:

- There is no WordPress admin at 2am.
- There is no database to babysit in a hostel Wi-Fi situation.
- A blog post is a file. If git has it, the site can have it.

Layouts are custom. There is a theme folder in the repo, but the pages you actually see (home, Charge Stats, About, Contact) are ours. Bootstrap and Font Awesome for the obvious stuff, **Leaflet** for maps, and a warm editorial CSS file we keep poking at.

Netlify is also where secrets live. Tesla client id, client secret, VIN, the boring env vars. None of that is in git. If you fork the repo you get a travel blog, not our car.

## What the Tesla integration actually is

We wanted the site to know something true about the trip without turning it into a tracker.

So we built **Charge Stats** against Tesla’s official **Fleet API**, as a personal app, not as a fleet operator. Scopes are tight on purpose: vehicle information and load management. No vehicle commands, no “wake the car and honk”, no live GPS on the public internet.

What Tesla will happily give us is **billed Supercharger (and other Tesla-billed) history**. Home charging does not show up there. We accepted that. The page says so.

A scheduled job is supposed to pull that history every six hours, squash it into a public snapshot (kWh, euros, site names, no VIN, no tokens), and stash it. The homepage and `/charging/` just fetch that JSON.

Until Netlify’s free credits recover enough for the function to run on a timer, the snapshot is a file we generated once from a real pull: 53 sessions, about 2,197 kWh, €837, 46 Superchargers, 28 April to 23 July 2026. The map pins are those site names matched to public Supercharger coordinates. Tesla’s history has names. It does not hand you a nice lat/lng for a blog map.

The homepage map is the same data plus the blog pins. Amber teardrops are stories. Small red dots are Superchargers. Click a red one and you get kWh and what we paid, including each session if we stopped there more than once.

The little **On the road / Off the road** chip is not a live location either. It looks at the last billed Supercharge. If that was in the last week, we are “on the road”. Otherwise we are parked, last seen in Málaga on 23 July. Privacy-wise that is the whole point.

## The AI workflow (the part people actually ask about)

I am a solution architect. I can write Hugo templates. I do not want to spend a Sunday night fighting Leaflet popups by hand.

So we use **Grok Bot** (and Cursor cloud agents behind it) as a very fast junior who already has the repo.

The loop looks like this:

1. We say what we want in chat. “Put costs on the Supercharger pins.” “About is a mess.” “Use this picture.”
2. The bot reads the live site and the repo, changes files, and opens a **GitHub pull request**.
3. Netlify builds a **deploy preview**. We look at it on a phone like normal people.
4. We merge. Sometimes Netlify publishes production by itself. Sometimes credits are gone and we publish the preview by hand, or the bot publishes it from this Mac when the desktop app is actually connected.

That last sentence is not a joke. We burned the free build minutes, so for a while nothing auto-deployed and the bot learned to upload a local Hugo build. Then we started committing again so GitHub and the live site stop disagreeing. (We learned that the hard way when the Map menu item came back from the dead.)

What the bot is good at:

- The glue. Netlify redirects, Leaflet popups, “please do not put `/map/` in the nav again”.
- Turning Tesla’s fee objects into “€ 23” on a pin.
- Restructuring About without inventing new jobs we never had.

What it is not:

- The source of truth. GitHub is.
- Allowed to put live GPS on the internet.
- Allowed to commit `.env` files. If it ever does, the PR does not get merged.

Cristyne still writes like a human. The visa post and the Cádiz day trip are us. The bot did not invent the gestoría, and it did not eat the tapas. It is much more useful on the “make the map tell the truth” class of problems.

## Why a static site plus a tiny API is enough

People hear “Tesla API” and imagine a websocket into the car. We have the opposite design.

Visitors never talk to Tesla. They talk to a JSON file (or a function that returns the same shape). If Tesla is down, the last snapshot stays up. If we forget to refresh, the page is a few weeks stale and still honest about the dates.

That is also why we killed the old `/map/` page. It was a leftover with fake Tesla stats (0 km, 0 Superchargers) sitting next to a homepage that already had the real trail. One map. One set of numbers. Charge Stats owns the bill.

## If you want to steal this

You do not need our stack. You need three decisions:

1. **Static first.** A file you can rebuild on a laptop will outlive whatever CMS you were about to install.
2. **Secrets stay off the public site.** OAuth and VINs go in the host’s env, not in the JavaScript that draws the map.
3. **AI is a coworker with a PR button, not an admin login.** Read the diff. Click the preview. Then merge.

We will turn the six-hour Tesla refresh back on when Netlify stops side-eyeing our credit balance. Until then the snapshot is frozen, the sunset photo on the homepage is real, and the Supercharger dots are still the trip.

If you are building something similar and get stuck on Tesla’s “is this a fleet?” form: yes, you create a Fleet API app even when the fleet is one Model Y and a very patient spouse.
