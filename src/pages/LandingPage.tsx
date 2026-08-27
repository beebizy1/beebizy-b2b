import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { X } from "lucide-react";

const landingMarkup = "<div class=\"min-h-screen bg-background flex flex-col font-sans\"><header class=\"fixed top-0 inset-x-0 bg-background/80 backdrop-blur-md z-50 border-b border-border\"><div class=\"container mx-auto px-6 h-16 flex items-center justify-between\"><img alt=\"Beebizy\" class=\"h-12 w-auto\" src=\"/beebizy-logo.png\"><nav class=\"flex items-center gap-3\"><a href=\"#who\" class=\"text-sm font-medium text-muted-foreground hover:text-foreground hidden md:block transition-colors\">Who it's for</a><a href=\"#features\" class=\"text-sm font-medium text-muted-foreground hover:text-foreground hidden md:block transition-colors\">Features</a><button class=\"justify-center whitespace-nowrap rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 hover-elevate active-elevate-2 border [border-color:var(--button-outline)] shadow-xs active:shadow-none min-h-9 px-4 py-2 font-semibold hidden sm:flex items-center gap-1.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-phone-call w-4 h-4\" aria-hidden=\"true\"><path d=\"M13 2a9 9 0 0 1 9 9\"></path><path d=\"M13 6a5 5 0 0 1 5 5\"></path><path d=\"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384\"></path></svg>Talk to Sales</button><button class=\"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-9 px-4 py-2 font-semibold shadow-md shadow-primary/20 hover:scale-105 transition-transform active:scale-95\">Try the Demo</button></nav></div></header><main class=\"flex-1 flex flex-col items-center overflow-x-hidden\"><section class=\"w-full pt-40 pb-28 flex flex-col items-center relative overflow-hidden\"><div class=\"absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10\"></div><div class=\"container mx-auto px-6 max-w-4xl text-center\"><div class=\"flex flex-col items-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700\"><div class=\"inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-black font-bold text-sm tracking-wide border border-primary/20\"><span class=\"w-2 h-2 rounded-full bg-primary animate-pulse\"></span>Event management software built for how teams actually work</div><h1 class=\"text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.05]\">Every team runs events.<br><span class=\"text-transparent bg-clip-text bg-gradient-to-br from-primary via-orange-400 to-red-500\">Beebizy makes it effortless.</span></h1><p class=\"text-xl md:text-2xl text-muted-foreground max-w-2xl font-medium leading-relaxed\">Whether you're coordinating a global enterprise summit, moving fast with a lean ops team, or rallying a community around a cause — Beebizy gives you the control room you need.</p><div class=\"flex flex-col sm:flex-row items-center gap-4 pt-2\"><button class=\"inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 hover-elevate active-elevate-2 bg-primary text-primary-foreground border border-primary-border min-h-10 rounded-md h-14 px-8 text-lg font-bold shadow-xl shadow-primary/20 hover:scale-105 transition-all group\">Launch Demo<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-arrow-right ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform\" aria-hidden=\"true\"><path d=\"M5 12h14\"></path><path d=\"m12 5 7 7-7 7\"></path></svg></button><button class=\"justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 hover-elevate active-elevate-2 [border-color:var(--button-outline)] shadow-xs active:shadow-none min-h-10 rounded-md h-14 px-8 text-lg font-bold border-2 flex items-center gap-2\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-phone-call w-5 h-5\" aria-hidden=\"true\"><path d=\"M13 2a9 9 0 0 1 9 9\"></path><path d=\"M13 6a5 5 0 0 1 5 5\"></path><path d=\"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384\"></path></svg>Talk to Sales</button></div></div></div></section><section class=\"w-full py-14 border-y border-gray-100 bg-white/60\"><div class=\"container mx-auto px-6 max-w-4xl\"><p class=\"text-center text-xs font-bold uppercase tracking-widest text-muted-foreground mb-10\">Trusted by teams at</p><div class=\"flex flex-wrap items-center justify-center gap-12 md:gap-20\"><img alt=\"Paramount Pictures\" class=\"h-16 w-auto object-contain opacity-60 hover:opacity-100 transition-opacity duration-300\" src=\"/logo-paramount.svg\"><img alt=\"Marriott Bonvoy\" class=\"h-14 w-auto object-contain opacity-60 hover:opacity-100 transition-opacity duration-300\" src=\"/logo-marriott.svg\"><img alt=\"Babylist\" class=\"h-14 w-auto object-contain opacity-60 hover:opacity-100 transition-opacity duration-300\" src=\"/logo-babylist.svg\"></div></div></section><section class=\"w-full py-36 bg-amber-50\"><div class=\"container mx-auto px-6\"><div class=\"max-w-5xl mx-auto\"><div class=\"text-center mb-16\"><p class=\"text-base font-bold uppercase tracking-widest text-primary mb-4\">Why teams switch</p><h2 class=\"text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight leading-tight\">Stop patching three tools together.</h2></div><div class=\"grid grid-cols-3 gap-6 mb-14\"><div class=\"bg-white rounded-3xl p-10 text-center border border-amber-100\"><div class=\"text-7xl font-black text-gray-900 mb-3 tabular-nums\">200+</div><div class=\"text-base text-gray-500 font-medium leading-snug\">Hours saved annually per team</div></div><div class=\"bg-white rounded-3xl p-10 text-center border border-amber-100\"><div class=\"text-7xl font-black text-gray-900 mb-3 tabular-nums\">40%</div><div class=\"text-base text-gray-500 font-medium leading-snug\">Lower vendor costs on average</div></div><div class=\"bg-white rounded-3xl p-10 text-center border border-amber-100\"><div class=\"text-7xl font-black text-gray-900 mb-3 tabular-nums\">3×</div><div class=\"text-base text-gray-500 font-medium leading-snug\">Faster event setup than before</div></div></div><div class=\"grid sm:grid-cols-2 gap-5\"><div class=\"flex items-center gap-5 bg-white rounded-2xl p-6 border border-amber-100\"><div class=\"w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-building2 lucide-building-2 w-6 h-6\" aria-hidden=\"true\"><path d=\"M10 12h4\"></path><path d=\"M10 8h4\"></path><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"></path><path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"></path><path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"></path></svg></div><p class=\"text-lg text-gray-700 font-medium leading-snug\">Enterprise teams: one registry, not a dozen spreadsheets.</p></div><div class=\"flex items-center gap-5 bg-white rounded-2xl p-6 border border-amber-100\"><div class=\"w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-zap w-6 h-6\" aria-hidden=\"true\"><path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"></path></svg></div><p class=\"text-lg text-gray-700 font-medium leading-snug\">Lean teams: live in two minutes, not two weeks.</p></div><div class=\"flex items-center gap-5 bg-white rounded-2xl p-6 border border-amber-100\"><div class=\"w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-heart w-6 h-6\" aria-hidden=\"true\"><path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\"></path></svg></div><p class=\"text-lg text-gray-700 font-medium leading-snug\">Nonprofits: simple enough for a two-person volunteer team.</p></div><div class=\"flex items-center gap-5 bg-white rounded-2xl p-6 border border-amber-100\"><div class=\"w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-layers w-6 h-6\" aria-hidden=\"true\"><path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"></path><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"></path><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"></path></svg></div><p class=\"text-lg text-gray-700 font-medium leading-snug\">Everyone: real data, live — not static exports.</p></div></div></div></div></section><section id=\"who\" class=\"w-full py-28 bg-white\"><div class=\"container mx-auto px-6\"><div class=\"max-w-2xl mx-auto text-center mb-16\"><p class=\"text-base font-bold uppercase tracking-widest text-primary mb-3\">Who it's for</p><h2 class=\"text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-5 leading-tight\">Your team. Your workflow.</h2><p class=\"text-xl text-gray-600 leading-relaxed\">Three very different teams. One platform that gets out of their way.</p></div><div class=\"grid md:grid-cols-3 gap-7 max-w-6xl mx-auto\"><div class=\"group rounded-3xl border border-gray-100 bg-white p-9 hover:shadow-2xl hover:shadow-black/8 hover:-translate-y-2 transition-all duration-300 flex flex-col gap-6\"><div class=\"w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-earth w-7 h-7 text-white\" aria-hidden=\"true\"><path d=\"M21.54 15H17a2 2 0 0 0-2 2v4.54\"></path><path d=\"M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17\"></path><path d=\"M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05\"></path><circle cx=\"12\" cy=\"12\" r=\"10\"></circle></svg></div><div><p class=\"text-[11px] font-bold uppercase tracking-widest mb-2 text-violet-500\">Distributed Enterprise Teams</p><h3 class=\"text-2xl font-extrabold text-gray-900 leading-snug\">Coordinate events across every time zone — without losing the thread.</h3></div><p class=\"text-gray-600 leading-relaxed flex-1 text-base\">Large organizations need more than a scheduling tool. Beebizy gives enterprise teams a single source of truth for every event: who owns it, who's attending, and what's happening next — across every region and department.</p><ul class=\"space-y-2.5\"><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-violet-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">Centralized event registry across all business units</span></li><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-violet-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">Acts as a centralized system for franchises</span></li><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-violet-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">Real-time attendance visibility for stakeholders</span></li></ul><a href=\"/demo\" class=\"inline-flex items-center gap-1.5 text-sm font-bold text-violet-500 group-hover:gap-3 transition-all\">See it in action <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-arrow-right w-4 h-4\" aria-hidden=\"true\"><path d=\"M5 12h14\"></path><path d=\"m12 5 7 7-7 7\"></path></svg></a></div><div class=\"group rounded-3xl border border-gray-100 bg-white p-9 hover:shadow-2xl hover:shadow-black/8 hover:-translate-y-2 transition-all duration-300 flex flex-col gap-6\"><div class=\"w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-zap w-7 h-7 text-white\" aria-hidden=\"true\"><path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"></path></svg></div><div><p class=\"text-[11px] font-bold uppercase tracking-widest mb-2 text-orange-500\">Lean Operating Teams</p><h3 class=\"text-2xl font-extrabold text-gray-900 leading-snug\">Execute events fast. Skip the overhead.</h3></div><p class=\"text-gray-600 leading-relaxed flex-1 text-base\">Small teams move at startup speed. Beebizy was built for organizers who can't afford 3-week onboarding or a 40-tab dashboard. Create an event, add attendees, and go — in under two minutes.</p><ul class=\"space-y-2.5\"><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-orange-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">Event live in under 2 minutes from blank slate</span></li><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-orange-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">No complex setup, no training required</span></li><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-orange-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">Attendee and registration management in one view</span></li></ul><a href=\"/demo\" class=\"inline-flex items-center gap-1.5 text-sm font-bold text-orange-500 group-hover:gap-3 transition-all\">See it in action <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-arrow-right w-4 h-4\" aria-hidden=\"true\"><path d=\"M5 12h14\"></path><path d=\"m12 5 7 7-7 7\"></path></svg></a></div><div class=\"group rounded-3xl border border-gray-100 bg-white p-9 hover:shadow-2xl hover:shadow-black/8 hover:-translate-y-2 transition-all duration-300 flex flex-col gap-6\"><div class=\"w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-heart w-7 h-7 text-white\" aria-hidden=\"true\"><path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\"></path></svg></div><div><p class=\"text-[11px] font-bold uppercase tracking-widest mb-2 text-teal-500\">Mission-Driven Organizations</p><h3 class=\"text-2xl font-extrabold text-gray-900 leading-snug\">Run events that reflect your values — not your budget constraints.</h3></div><p class=\"text-gray-600 leading-relaxed flex-1 text-base\">Nonprofits, advocacy groups, and community organizations don't have dedicated event ops staff. Beebizy handles the logistics so your team can focus on impact, outreach, and the people who show up.</p><ul class=\"space-y-2.5\"><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-teal-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">Simple volunteer and attendee tracking</span></li><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-teal-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">Clear registration status for community planning</span></li><li class=\"flex items-start gap-2.5\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-4 h-4 shrink-0 mt-0.5 text-teal-500\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-sm text-gray-600 font-medium\">Lightweight enough for a two-person operations team</span></li></ul><a href=\"/demo\" class=\"inline-flex items-center gap-1.5 text-sm font-bold text-teal-500 group-hover:gap-3 transition-all\">See it in action <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-arrow-right w-4 h-4\" aria-hidden=\"true\"><path d=\"M5 12h14\"></path><path d=\"m12 5 7 7-7 7\"></path></svg></a></div></div></div></section><section class=\"w-full py-28 bg-white\"><div class=\"container mx-auto px-6\"><div class=\"max-w-2xl mx-auto text-center mb-14\"><p class=\"text-base font-bold uppercase tracking-widest text-primary mb-3\">Corporate Trends</p><h2 class=\"text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-5 leading-tight\">What are you planning?</h2><p class=\"text-xl text-gray-600 leading-relaxed\">See what corporate teams are running right now — and jump straight into a template.</p></div><div class=\"grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto\"><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-earth w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M21.54 15H17a2 2 0 0 0-2 2v4.54\"></path><path d=\"M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17\"></path><path d=\"M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05\"></path><circle cx=\"12\" cy=\"12\" r=\"10\"></circle></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Annual Summit</span><span class=\"text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700\">Most popular</span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-users w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"></path><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"></path><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"></path><circle cx=\"9\" cy=\"7\" r=\"4\"></circle></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Team Offsite</span><span class=\"text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700\">Trending</span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-zap w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Product Launch</span><span class=\"text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700\">Trending</span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-trophy w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978\"></path><path d=\"M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978\"></path><path d=\"M18 9h1.5a1 1 0 0 0 0-5H18\"></path><path d=\"M4 22h16\"></path><path d=\"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z\"></path><path d=\"M6 9H4.5a1 1 0 0 1 0-5H6\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Awards Ceremony</span><span class=\"h-4\"></span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-building2 lucide-building-2 w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M10 12h4\"></path><path d=\"M10 8h4\"></path><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"></path><path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"></path><path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Customer Conference</span><span class=\"text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700\">Rising</span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-megaphone w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z\"></path><path d=\"M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14\"></path><path d=\"M8 6v8\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Town Hall</span><span class=\"h-4\"></span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-heart w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Fundraising Gala</span><span class=\"text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700\">Popular</span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-party-popper w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M5.8 11.3 2 22l10.7-3.79\"></path><path d=\"M4 3h.01\"></path><path d=\"M22 8h.01\"></path><path d=\"M15 2h.01\"></path><path d=\"M22 20h.01\"></path><path d=\"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10\"></path><path d=\"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17\"></path><path d=\"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7\"></path><path d=\"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Holiday Party</span><span class=\"h-4\"></span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-briefcase w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\"></path><rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\"></rect></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Sales Kickoff</span><span class=\"text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700\">Trending</span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-calendar-check w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M8 2v4\"></path><path d=\"M16 2v4\"></path><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"></rect><path d=\"M3 10h18\"></path><path d=\"m9 16 2 2 4-4\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Training Day</span><span class=\"h-4\"></span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chart-column w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M3 3v16a2 2 0 0 0 2 2h16\"></path><path d=\"M18 17V9\"></path><path d=\"M13 17V5\"></path><path d=\"M8 17v-3\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Investor Day</span><span class=\"text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700\">Rising</span></div></a><a href=\"/demo\"><div class=\"group flex flex-col items-center text-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:shadow-black/6 hover:-translate-y-1 transition-all duration-200 cursor-pointer\"><div class=\"w-12 h-12 rounded-2xl bg-gray-50 group-hover:bg-primary/10 flex items-center justify-center transition-colors\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-layers w-6 h-6 text-gray-400 group-hover:text-primary transition-colors\" aria-hidden=\"true\"><path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"></path><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"></path><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"></path></svg></div><span class=\"text-sm font-bold text-gray-800 leading-snug\">Multi-City Roadshow</span><span class=\"h-4\"></span></div></a></div></div></section><section class=\"w-full py-28 bg-amber-50\"><div class=\"container mx-auto px-6\"><div class=\"max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-16\"><div class=\"flex-1 flex flex-col gap-7\"><div><p class=\"text-xs font-bold uppercase tracking-widest text-primary mb-3\">Vendor Network</p><h2 class=\"text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5\">Bring your vendors<br>into the hive.</h2><p class=\"text-xl text-gray-500 leading-relaxed\">Send a link. Your AV company, caterer, or venue joins Beebizy in seconds — no account setup required on their end. They appear in your vendor marketplace, filtered by city, ready to assign to your next event.</p></div><ul class=\"space-y-3\"><li class=\"flex items-start gap-3\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-5 h-5 shrink-0 mt-0.5 text-primary\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-base text-gray-700 font-medium\">One link gets any vendor into your marketplace</span></li><li class=\"flex items-start gap-3\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-5 h-5 shrink-0 mt-0.5 text-primary\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-base text-gray-700 font-medium\">Filter vendors by city when planning multi-location events</span></li><li class=\"flex items-start gap-3\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-5 h-5 shrink-0 mt-0.5 text-primary\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-base text-gray-700 font-medium\">Track which vendors are confirmed per event</span></li><li class=\"flex items-start gap-3\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-circle-check w-5 h-5 shrink-0 mt-0.5 text-primary\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"></circle><path d=\"m9 12 2 2 4-4\"></path></svg><span class=\"text-base text-gray-700 font-medium\">Build a reusable vendor list across your whole team</span></li></ul></div><div class=\"flex-1 flex items-center justify-center w-full\"><div class=\"bg-white rounded-3xl shadow-xl shadow-amber-100 border border-amber-100 overflow-hidden w-full max-w-sm flex flex-col gap-6\" style=\"padding: 0px;\"><img alt=\"Vendor dashboard\" class=\"w-full h-auto rounded-3xl object-cover\" src=\"/vendor-dashboard.jpg\"></div></div></div></div></section><section id=\"features\" class=\"w-full py-28 bg-gray-50\"><div class=\"container mx-auto px-6\"><div class=\"max-w-2xl mx-auto text-center mb-16\"><p class=\"text-xs font-bold uppercase tracking-widest text-primary mb-3\">Features</p><h2 class=\"text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-5 leading-tight\">One platform. Every event type.</h2><p class=\"text-xl text-gray-400 leading-relaxed\">The same tools that power a 2,000-person summit work for a 20-person offsite.</p></div><div class=\"grid md:grid-cols-2 lg:grid-cols-4 gap-10 max-w-6xl mx-auto\"><div class=\"flex flex-col gap-4\"><div class=\"w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-layout-dashboard w-7 h-7 text-violet-600\" aria-hidden=\"true\"><rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"></rect><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"></rect><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"></rect><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"></rect></svg></div><h3 class=\"text-lg font-extrabold text-gray-900\">One Dashboard</h3><p class=\"text-gray-400 leading-relaxed text-sm\">All events, all teams, all statuses — visible in a single view. No tab-switching, no exports needed.</p></div><div class=\"flex flex-col gap-4\"><div class=\"w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-users w-7 h-7 text-amber-600\" aria-hidden=\"true\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"></path><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"></path><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"></path><circle cx=\"9\" cy=\"7\" r=\"4\"></circle></svg></div><h3 class=\"text-lg font-extrabold text-gray-900\">Attendee CRM</h3><p class=\"text-gray-400 leading-relaxed text-sm\">Know exactly who's registered, confirmed, or cancelled for every event across your organization.</p></div><div class=\"flex flex-col gap-4\"><div class=\"w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-calendar-check w-7 h-7 text-teal-600\" aria-hidden=\"true\"><path d=\"M8 2v4\"></path><path d=\"M16 2v4\"></path><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"></rect><path d=\"M3 10h18\"></path><path d=\"m9 16 2 2 4-4\"></path></svg></div><h3 class=\"text-lg font-extrabold text-gray-900\">Registration Engine</h3><p class=\"text-gray-400 leading-relaxed text-sm\">Manage registrations with a click. Confirm, cancel, or reassign attendees without touching a spreadsheet.</p></div><div class=\"flex flex-col gap-4\"><div class=\"w-14 h-14 rounded-2xl bg-rose-100 flex items-center justify-center\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chart-column w-7 h-7 text-rose-600\" aria-hidden=\"true\"><path d=\"M3 3v16a2 2 0 0 0 2 2h16\"></path><path d=\"M18 17V9\"></path><path d=\"M13 17V5\"></path><path d=\"M8 17v-3\"></path></svg></div><h3 class=\"text-lg font-extrabold text-gray-900\">Live Analytics</h3><p class=\"text-gray-400 leading-relaxed text-sm\">Capacity utilization, category breakdowns, confirmed vs pending — updated the moment data changes.</p></div></div></div></section><section id=\"about\" class=\"w-full py-28 bg-amber-50\">\n<div class=\"container mx-auto px-6\">\n<div class=\"max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-16\">\n<div class=\"flex-1\">\n<p class=\"text-base font-bold uppercase tracking-widest text-primary mb-4\">Our story</p>\n<h2 class=\"text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-8 leading-tight\">Built by an event planner,<br>for event planners.</h2>\n<div class=\"space-y-6 text-lg text-gray-600 leading-relaxed\">\n<p><strong class=\"font-bold text-gray-900\">Laila Marshall</strong> spent over a decade in the field, coordinating more than <strong class=\"font-bold text-gray-900\">500 events</strong> across corporate conferences, galas, product launches, and everything in between.</p>\n<p>After years of juggling spreadsheets, endless email threads, and tools that were clearly built by people who had never planned an event, she had a simple thought: <em class=\"font-semibold text-gray-900\">“There has to be a better way.”</em></p>\n<p>Beebizy is the tool Laila wished she had. Not a generic project manager with an “events” tag, but a platform designed from the ground up for how event teams actually operate, from the first vendor call to the post-event wrap-up.</p>\n<p>Today, Beebizy helps teams at Fortune 500 companies, nonprofits, and everything in between bring their events to life without losing their minds in the process.</p>\n</div>\n<div class=\"flex items-center gap-4 mt-8\">\n<img src=\"/laila-marshall.png\" alt=\"\" class=\"w-14 h-14 rounded-full object-cover object-top border-2 border-primary\">\n<div><p class=\"font-extrabold text-gray-900\">Laila Marshall</p><p class=\"text-gray-600\">Founder &amp; CEO, Beebizy</p></div>\n</div>\n</div>\n<div class=\"flex-1 relative w-full max-w-lg\">\n<img src=\"/laila-marshall.png\" alt=\"Laila Marshall, founder and CEO of Beebizy\" class=\"w-full rounded-3xl object-cover object-top border-4 border-primary shadow-2xl\" loading=\"lazy\">\n<div class=\"absolute -bottom-6 left-6 right-6 bg-white rounded-2xl border border-amber-100 px-6 py-4 shadow-xl\">\n<p class=\"font-extrabold text-gray-900\">Laila Marshall</p>\n<p class=\"text-sm text-gray-600\">Founder &amp; CEO, Beebizy · 500+ events planned</p>\n</div>\n</div>\n</div>\n</div>\n</section><section id=\"testimonial-slot\"></section><section class=\"w-full py-28 bg-gray-900 text-white text-center px-6\"><div class=\"container mx-auto max-w-2xl\"><h2 class=\"text-4xl md:text-6xl font-extrabold mb-6 tracking-tight leading-tight\">Which team are you?</h2><p class=\"text-lg md:text-xl mb-12 text-white/50 font-medium leading-relaxed\">Enterprise, lean, or mission-driven — try the working demo. No sign-up. No credit card.</p><button class=\"inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 hover-elevate active-elevate-2 border border-primary-border min-h-10 rounded-md h-14 px-10 text-lg font-bold bg-primary text-primary-foreground shadow-2xl shadow-primary/40 hover:scale-105 transition-transform\">Launch the Demo<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-arrow-right ml-2 w-5 h-5\" aria-hidden=\"true\"><path d=\"M5 12h14\"></path><path d=\"m12 5 7 7-7 7\"></path></svg></button></div></section></main><footer class=\"bg-card border-t py-12\"><div class=\"container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4\"><img alt=\"Beebizy\" class=\"h-8 w-auto\" src=\"/beebizy-logo.png\"><div class=\"flex gap-6 text-sm font-medium text-muted-foreground\"><a href=\"#who\" class=\"hover:text-foreground transition-colors\">Who it's for</a><a href=\"#features\" class=\"hover:text-foreground transition-colors\">Features</a><button class=\"hover:text-foreground transition-colors\">Demo</button></div><p class=\"text-sm text-muted-foreground font-medium\">© 2026 Beebizy Inc. All rights reserved.</p></div></footer></div><div role=\"region\" aria-label=\"Notifications (F8)\" tabindex=\"-1\" style=\"pointer-events: none;\"><ol tabindex=\"-1\" class=\"fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]\"></ol></div><div id=\"sales-dialog\" class=\"hidden fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Talk to sales\">\n  <div class=\"my-8 w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl\">\n\n    <div id=\"sales-step-form\">\n      <h2 class=\"text-2xl font-extrabold tracking-tight text-slate-900\">Talk to sales</h2>\n      <p class=\"mt-2 text-sm text-slate-500\">Tell us a little about your team and we'll be in touch within one business day. You'll get the working demo link as soon as you submit.</p>\n\n      <form id=\"sales-form\" class=\"mt-6 space-y-4\">\n        <div>\n          <label for=\"lead-name\" class=\"block text-sm font-semibold text-slate-900\">Name</label>\n          <input id=\"lead-name\" name=\"name\" required=\"\" autocomplete=\"name\" class=\"mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200\">\n        </div>\n        <div>\n          <label for=\"lead-email\" class=\"block text-sm font-semibold text-slate-900\">Work email</label>\n          <input id=\"lead-email\" name=\"email\" type=\"email\" required=\"\" autocomplete=\"email\" class=\"mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200\">\n        </div>\n        <div>\n          <label for=\"lead-company\" class=\"block text-sm font-semibold text-slate-900\">Company</label>\n          <input id=\"lead-company\" name=\"company\" required=\"\" autocomplete=\"organization\" class=\"mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200\">\n        </div>\n        <div>\n          <label for=\"lead-phone\" class=\"block text-sm font-semibold text-slate-900\">Phone <span class=\"font-normal text-slate-400\">optional</span></label>\n          <input id=\"lead-phone\" name=\"phone\" type=\"tel\" autocomplete=\"tel\" class=\"mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200\">\n        </div>\n        <div>\n          <label for=\"lead-volume\" class=\"block text-sm font-semibold text-slate-900\">How many events do you run a year?</label>\n          <select id=\"lead-volume\" name=\"volume\" required=\"\" class=\"mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200\">\n            <option value=\"\" selected=\"\" disabled=\"\">Select one</option>\n            <option value=\"1-5\">1–5</option>\n            <option value=\"6-20\">6–20</option>\n            <option value=\"20+\">20+</option>\n          </select>\n        </div>\n\n        <input type=\"text\" name=\"website\" tabindex=\"-1\" autocomplete=\"off\" aria-hidden=\"true\" class=\"absolute left-[-9999px] h-0 w-0 opacity-0\">\n\n        <p id=\"sales-error\" class=\"hidden rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700\"></p>\n\n        <div class=\"flex items-center gap-3 pt-1\">\n          <button id=\"sales-submit\" type=\"submit\" class=\"rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-500 disabled:opacity-60\">Send</button>\n          <button type=\"button\" data-close-sales=\"\" class=\"text-sm font-semibold text-slate-500 hover:text-slate-900\">Cancel</button>\n        </div>\n      </form>\n    </div>\n\n    <div id=\"sales-step-done\" class=\"hidden text-center\">\n      <div class=\"mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl\">🐝</div>\n      <h2 class=\"mt-4 text-2xl font-extrabold tracking-tight text-slate-900\">Thanks — we've got it.</h2>\n      <!-- Copy for the no-booking case. src/main.ts rewrites this when a Calendly\n           widget is actually going to render, so the text never promises a\n           scheduler that isn't there. -->\n      <p id=\"sales-done-sub\" class=\"mx-auto mt-2 max-w-md text-sm text-slate-500\">Someone from the team will be in touch within one business day.</p>\n\n      <!-- Calendly inline booking. The widget script is injected by src/main.ts only\n           when this step is reached, so it never costs the landing page anything.\n           If CALENDLY_URL isn't set, this stays hidden and the fallback below shows. -->\n      <div id=\"calendly-mount\" class=\"mt-5 hidden\">\n        <div id=\"calendly-widget\" class=\"calendly-inline-widget\" style=\"min-width:320px;height:640px;\"></div>\n      </div>\n\n\n      <button data-close-sales=\"\" class=\"mt-4 block w-full text-sm font-semibold text-slate-500 hover:text-slate-900\">Back to the site</button>\n    </div>\n\n  </div>\n</div>";

function HeaderMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-controls="header-navigation-menu"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className="flex size-11 flex-col items-center justify-center gap-[5px] text-gray-900 transition-opacity hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? (
          <X aria-hidden="true" className="size-7" />
        ) : (
          <>
            <span aria-hidden="true" className="block h-[2px] w-7 bg-current" />
            <span aria-hidden="true" className="block h-[2px] w-7 bg-current" />
            <span aria-hidden="true" className="block h-[2px] w-7 bg-current" />
          </>
        )}
      </button>

      {isOpen ? (
        <nav
          id="header-navigation-menu"
          aria-label="Header navigation"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-[60] w-56 rounded-2xl border border-amber-200 bg-white p-2 shadow-[0_18px_50px_rgba(31,24,10,0.18)]"
        >
          <a
            href="#who"
            className="block rounded-xl px-4 py-3 text-sm font-bold text-gray-900 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            onClick={() => setIsOpen(false)}
          >
            Who It’s For
          </a>
          <a
            href="#features"
            className="block rounded-xl px-4 py-3 text-sm font-bold text-gray-900 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            onClick={() => setIsOpen(false)}
          >
            Features
          </a>
          <a
            href="/about"
            className="block rounded-xl px-4 py-3 text-sm font-bold text-gray-900 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            About Us
          </a>
        </nav>
      ) : null}
    </div>
  );
}

type TestimonialIdentity = {
  name: string;
  role?: string;
  initials: string;
};

type Testimonial = TestimonialIdentity &
  (
    | {
        kind: "quote";
        quote: string;
        event?: string;
      }
    | {
        kind: "video";
        video: {
          src: string;
          poster: string;
        };
      }
  );

const testimonials: Testimonial[] = [
  {
    kind: "quote",
    quote:
      "I’ve had the pleasure of working with Laila and the Beebizy team for the past two years at SXSW on the Ayana Foundation Tenpole community event. They’re incredible at sourcing vendors, bringing huge amounts of creativity, and making the production feel seamless with real-time problem-solving and a calm, steady approach. Collaborating with them has been such a joy, they help bring a vision to life while connecting with other amazing creatives. On top of that, their network of top-notch creative companies spans multiple cities across the U.S., making them an invaluable partner for any project.",
    name: "Jaclynn Brennan",
    role: "Co-founder, Ayana Foundation",
    initials: "JB",
  },
  {
    kind: "video",
    name: "Nia Sanchez",
    role: "Featured on Bravo’s hit TV show “The Valley” • Used Beebizy for the show",
    initials: "NS",
    video: {
      src: "/nia-sanchez-testimonial.mp4",
      poster: "/nia-sanchez-testimonial-poster.jpg",
    },
  },
  {
    kind: "quote",
    event: "Watcher Live Viewing Party - Las Vegas",
    quote:
      "I loved working with them. We had such a great experience with Beebizy. They were on time and made everything super easy. I don’t love planning parties and surprises and they literally did it all! And it was very reasonable!",
    name: "@wearewatchers",
    initials: "WW",
  },
];

function TestimonialSection() {
  const testimonialGridClass =
    testimonials.length >= 3
      ? "lg:grid-cols-3"
      : testimonials.length === 2
        ? "lg:mx-auto lg:max-w-5xl lg:grid-cols-2"
        : "lg:mx-auto lg:max-w-lg";

  return (
    <div className="relative overflow-hidden border-y border-amber-100 bg-[#fffaf0] px-6 py-16 text-gray-950 md:py-24">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-28 select-none text-[18rem] font-black leading-none text-amber-200/50 md:right-8 md:text-[24rem]"
      >
        “
      </span>

      <div className="container relative mx-auto max-w-7xl">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-700">
            Partner perspectives
          </p>
          <h2
            id="testimonial-heading"
            className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-gray-950 md:text-4xl"
          >
            Big ideas, brought to life without the chaos.
          </h2>
        </header>

        <div className={`mt-10 grid items-stretch gap-6 md:mt-14 ${testimonialGridClass}`}>
          {testimonials.map((testimonial) => (
            <figure
              className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-amber-200 bg-white shadow-[0_20px_55px_rgba(120,78,0,0.10)]"
              key={testimonial.name}
            >
              {testimonial.kind === "video" ? (
                <div className="relative flex flex-1 items-center justify-center bg-gray-950">
                  <span className="absolute left-4 top-4 z-10 rounded-full bg-primary px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-950 shadow-sm">
                    Video testimonial
                  </span>
                  <video
                    aria-label={`${testimonial.name} video testimonial`}
                    className="aspect-[9/16] max-h-[42rem] w-full bg-gray-950 object-contain"
                    controls
                    playsInline
                    poster={testimonial.video.poster}
                    preload="metadata"
                  >
                    <source src={testimonial.video.src} type="video/mp4" />
                    Your browser does not support embedded video.
                  </video>
                </div>
              ) : (
                <blockquote className="m-7 flex-1 border-l-4 border-primary pl-5 md:m-8">
                  {testimonial.event ? (
                    <div className="mb-6">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700">
                        Featured event
                      </p>
                      <h3 className="mt-2 text-xl font-extrabold leading-snug tracking-tight text-gray-950">
                        {testimonial.event}
                      </h3>
                    </div>
                  ) : null}
                  <p className="text-base font-medium leading-relaxed tracking-[-0.01em] text-gray-700 md:text-lg">
                    {testimonial.quote}
                  </p>
                </blockquote>
              )}

              <figcaption className="mt-auto flex items-center gap-4 border-t border-gray-200 px-7 py-6 md:px-8">
                <div
                  aria-hidden="true"
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-gray-950"
                >
                  {testimonial.initials}
                </div>
                <div>
                  <cite className="font-bold not-italic text-gray-950">{testimonial.name}</cite>
                  {testimonial.role ? <p className="mt-1 text-sm text-gray-500">{testimonial.role}</p> : null}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  useEffect(() => {
    const styles = ["/original.css", "/mobile.css"].map((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.beebizyLanding = "true";
      document.head.appendChild(link);
      return link;
    });

    const controls = Array.from(document.querySelectorAll<HTMLElement>("a, button"));
    const demoLabels = new Set(["demo", "try the demo", "launch demo", "launch the demo"]);
    const demoControls = controls.filter((control) => demoLabels.has(control.textContent?.trim().toLowerCase() ?? ""));
    demoControls.forEach((control) => {
      const labelNode = Array.from(control.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (labelNode) labelNode.textContent = "Book a Free Demo";
    });

    controls
      .filter((control) => control.textContent?.trim().toLowerCase() === "talk to sales")
      .filter((control) =>
        Array.from(control.parentElement?.querySelectorAll<HTMLElement>("a, button") ?? []).some((sibling) =>
          demoControls.includes(sibling),
        ),
      )
      .forEach((control) => control.remove());

    const openDemoForm = (event: MouseEvent) => {
      const trigger = (event.target as HTMLElement | null)?.closest("a, button");
      if (trigger?.textContent?.trim().toLowerCase() !== "book a free demo") return;

      event.preventDefault();
      const salesDialog = document.getElementById("sales-dialog");
      salesDialog?.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      salesDialog?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    };
    document.addEventListener("click", openDemoForm);

    const formIntro = Array.from(document.querySelectorAll<HTMLParagraphElement>("#sales-step-form p")).find((paragraph) =>
      paragraph.textContent?.includes("working demo link"),
    );
    if (formIntro) {
      formIntro.textContent =
        "Tell us a little about your team and we’ll follow up within one business day to schedule your demo.";
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = "/original-home.js";
    script.dataset.beebizyLanding = "true";
    const openRequestedSalesDialog = () => {
      if (new URLSearchParams(window.location.search).get("sales") !== "1") return;

      const demoTrigger = Array.from(document.querySelectorAll<HTMLElement>("a, button")).find((element) =>
        element.textContent?.trim().toLowerCase() === "book a free demo",
      );
      demoTrigger?.click();
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    };
    script.addEventListener("load", openRequestedSalesDialog);
    document.body.appendChild(script);

    const headerNavigation = document.querySelector("header nav");
    const headerTextLinks = headerNavigation
      ? Array.from(headerNavigation.querySelectorAll<HTMLAnchorElement>('a[href="#who"], a[href="#features"]'))
      : [];
    headerTextLinks.forEach((link) => {
      link.style.display = "none";
    });
    const headerMenuHost = document.createElement("div");
    headerMenuHost.dataset.beebizyHeaderMenu = "true";
    headerNavigation?.append(headerMenuHost);
    const headerMenuRoot = headerNavigation ? createRoot(headerMenuHost) : null;
    headerMenuRoot?.render(<HeaderMenu />);

    const testimonialSlot = document.getElementById("testimonial-slot");
    const testimonialHost = document.createElement("section");
    testimonialHost.id = "testimonial";
    testimonialHost.setAttribute("aria-labelledby", "testimonial-heading");
    if (testimonialSlot) {
      testimonialSlot.replaceWith(testimonialHost);
    } else {
      document.querySelector("main")?.append(testimonialHost);
    }
    const testimonialRoot = createRoot(testimonialHost);
    testimonialRoot.render(<TestimonialSection />);

    const demoPrompt = Array.from(document.querySelectorAll("p")).find((paragraph) =>
      paragraph.textContent?.includes("try the working demo. No sign-up."),
    );
    if (demoPrompt) {
      demoPrompt.textContent =
        "Enterprise, lean, or mission-driven. Request a personalized demo. No credit card.";
    }

    document.querySelectorAll('footer a[href="#features"]').forEach((featuresLink) => {
      const aboutLink = featuresLink.cloneNode(true) as HTMLAnchorElement;
      aboutLink.href = "/about";
      aboutLink.textContent = "About Us";
      featuresLink.after(aboutLink);
    });

    return () => {
      document.removeEventListener("click", openDemoForm);
      headerTextLinks.forEach((link) => link.style.removeProperty("display"));
      headerMenuRoot?.unmount();
      headerMenuHost.remove();
      testimonialRoot.unmount();
      testimonialHost.remove();
      styles.forEach((style) => style.remove());
      script.removeEventListener("load", openRequestedSalesDialog);
      script.remove();
      document.body.style.overflow = "";
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: landingMarkup }} />;
}

export default LandingPage;
