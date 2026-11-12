# SuiviBaby — founder context (2026-11-11)

Use this as the source of truth for the business. Repo: /Users/yoss/Projects/Samaye (read-only for you; docs/ has more: PREMIUM_OFFRE_CIBLE.md, archive/2026/todo_monetisation_2026-11.md, STORE_PRIVACY.md, PLAN_SPRINTS_AUDIT.md). Website copy: public/index.html. Write everything for the owner in French.

## Company
- TESFA, French SASU, one founder (Yoss, developer), Saint-Ouen (93). Target ~500 users at first. No funding, no team, no marketing budget stated.
- Legal: consumer mediator not chosen yet (mandatory before selling; CM2C recommended), DPO not designated.

## Product (live in closed testing)
- SuiviBaby: French baby-tracking app (iOS + Android, Expo/React Native, Firebase EU hosting). Version 1.0.14 in Google Play closed testing (Alpha) and TestFlight.
- Tracks: feeds (breast, bottle, solids), sleep/naps/bath/routines, diapers, pumping, health (temperature, symptoms, meds, vaccines), growth with WHO (OMS) curves, activities, milestones/photos/mood, stats, journal timeline, reminders, weekly recap e-mail, offline mode, night mode.
- Differentiators: voice entry ("biberon de 150 ml à 14 h 30", designed for 3 a.m.), real-time sharing with family/nanny with roles (Parent / Proche), EU hosting + GDPR, no ads, no tracking.
- Not built yet: home-screen widget, pediatrician PDF report (decided: build BEFORE launch, ~3-5 days), AI insights (removed from the offer), Apple Watch.

## Offer decided (2026-11-11)
- Free: unlimited children, unlimited sharing, 18 event types, stats + WHO curves, reminders, night mode, 3 voice commands/day, 1 PDF export.
- Premium: up to 50 voice commands/day, unlimited PDF exports, pediatrician report (to build). Later: widget quick-add.
- Prices TTC: 3,99 €/month, 29,99 €/year (7-day free trial on annual), 79,99 € lifetime. Name: "Premium".
- No limit on children (any per-account limit is bypassed with a second free account).

## Numbers already computed (unit-economics analysis, 2026-11-11)
- Net per subscriber after VAT 20 % and store commission 15 % (Small Business Program): monthly 2,83 €/month; annual 21,24 €/year (1,77 €/month); lifetime ~56,66 € Apple / ~50 € Google (Google 25 % on one-off EEA purchases since 2026-06-30).
- Voice cost ~0,1 cent per command (AssemblyAI ~0,21 $/h + Claude Haiku parse); real use ~15/day ≈ 0,50 €/month. AssemblyAI free plan = one-time 50 $ credits (≈ 6 weeks at 500 users) → pay-as-you-go decided.
- Fixed costs ~16 €/month at 0 users, ~25 € at 100, ~60 € at 500 (+ SASU accounting/bank ~110 €/month). Break-even ≈ 22 subscribers on infra, ≈ 75 subscribers including SASU fees. RevenueCat free under 2 500 $ MTR.

## Market (competitor research, 2026-11-11, App Store FR)
- Huckleberry: Plus 69,99 €/yr, Premium 118-130 €/yr, 2-week trial; drivers: sleep predictions (SweetSpot), AI, widgets, Apple Watch. 4,9★.
- Baby Daybook: ~26,99-43,99 €/yr, lifetime 43,99. Nara: 7,99-9,99 €/mo, lifetime 59,99-99,99. Glow Baby: 32,99-58,99 €/yr, lifetime 69,99. Sprout: 33-70 €/yr. Baby Connect: 59,99/yr. BabyTime: almost free (paid caregivers 1,99, no ads 3,99). May (French, parenting): 59,99-119,99 €/yr, 15-day trial, ~11k ratings.
- Our price is lower-middle; our free tier is more generous than most (sharing/stats usually paid) → risk = weak conversion, not acquisition.
- France: 20 mandatory child health exams (8th day, 1 month, 2 months, 4 months…), ~660k births/year.

## Go-to-market status / blockers
- Google Play production access requires 12 testers opted in for 14 consecutive days (currently 6) → recruit ≥ 6 more.
- App Store listing filled in French (description, keywords, categories Forme et santé + Style de vie, privacy labels drafted); still missing: screenshots, age rating, demo account, privacy publish, payments.
- Payments: Apple Paid Apps agreement not signed (legal entity update + DSA trader status), no Google Payments merchant account, RevenueCat keys placeholders, products not created. Compliance PR for the paywall open (#70).
- Paywall headlines proposed: « À 3 h du matin, dites-le. SuiviBaby note. » / « Les deux parents, la même page. Sans pub, sans stress. » / « Votre bébé, vos données : hébergées en Europe, jamais revendues. »
