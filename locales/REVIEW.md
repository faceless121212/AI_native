# Native-speaker review: Prompt 1 locale strings

Source: `locales/en`. Translations: de, fr, es (Spain), it. Informal address throughout (du / tu / tú / tu).
Every tone chip label is listed here because they are product labels, not literal translations.

Notes that apply to more than one language:
- **Gender of tone adjectives (fr, es, it):** the adjectives agree with the masculine noun "ton / tono" (a "warm tone"). They do not describe the user, but a woman could read e.g. "Assuré" / "Seguro" / "Sicuro" as being about herself. Please confirm this reads as describing the tone, or suggest an epicene or noun form.
- **Relationship chips** describe the other person. To avoid assuming gender, we used epicene words (fr Partenaire, Collègue; es Pareja, Colega; it Partner, Collega) or category nouns (de Freundeskreis, fr Amitié, es Amistad, it Amicizia; de Arbeit).
- **iOS Settings path (`keyboard:bar.noFullAccessPath`):** Apple's localised iPhone User Guide (iOS 27, "Add or change keyboards") confirms Settings → General → Keyboard → Keyboards as **Einstellungen → Allgemein → Tastatur → Tastaturen**, **Réglages → Général → Clavier → Claviers**, **Ajustes → General → Teclado → Teclados**, **Impostazioni → Generali → Tastiera → Tastiere**. I couldn't load an Apple page showing the "Allow Full Access" toggle, so that label comes from memory (fairly confident): de "Vollen Zugriff erlauben", fr "Autoriser l’accès complet", es "Permitir acceso total", it "Consenti accesso completo". **Check it on a real device in each language.**
- **"Settings" in `notifications:trialEndsTomorrow`:** translated with the iOS name (Einstellungen / Réglages / Ajustes / Impostazioni). On Android the system app is called "Paramètres" in French and "Configuración" in Spanish, and cancelling happens in Google Play. If "Settings" means the Replywise app's own Settings screen, these are fine, provided that screen gets the same name. Product needs to decide.

| Language | Key | Translation | Why check |
|---|---|---|---|
| de | keyboard:tone.warm | Herzlich | Tone chip |
| de | keyboard:tone.funny | Witzig | Tone chip |
| de | keyboard:tone.flirty | Flirty | Tone chip; English loanword as suggested by the i18n guide. Alternatives: "Flirtend", "Kokett" |
| de | keyboard:tone.confident | Selbstbewusst | Tone chip (13 chars) |
| de | keyboard:tone.calm | Ruhig | Tone chip; "Gelassen" is an alternative |
| de | keyboard:tone.apologise | Entschuldigen | Tone chip; a verb, while the other chips are adjectives |
| de | keyboard:tone.sayNoKindly | Sanft ablehnen | Tone chip (14, at the limit) |
| de | keyboard:tone.professional | Professionell | Tone chip |
| de | keyboard:relationship.partner | Partner:in | Gender colon; the guide says to use it only if natural. Alternative: "Beziehung" |
| de | keyboard:relationship.friend | Freundeskreis | "Freund" would suggest male friend or boyfriend |
| de | keyboard:relationship.colleague | Arbeit | Avoids Kollege/Kollegin; matches the onboarding "Work" chip |
| de | keyboard:closeness.justMet | Ganz neu | No room for "gerade kennengelernt" within 14 |
| de | keyboard:closeness.gettingToKnow | Kennenlernen | Noun form; does it read as a closeness step? |
| de | keyboard:chipRows.formality | Förmlichkeit | Alternative "Anrede", since it maps to du/Sie |
| de | common:actions.polish | Verbessern | "Polish" button; alternatives "Feinschliff", "Aufpolieren" |
| de | keyboard:counter.leftToday_* | Heute noch {{count}} | Bare number with no noun; is it clear on a chip? |
| de | keyboard:bar.lastTrialDay | Deine Testphase endet morgen, danach {{price}}/Woche. Verwalten in der Replywise-App. | "Verwalten" is an infinitive used as an instruction |
| de | paywall:fairUse | Faire Nutzung: bis zu 100 Antworten pro Tag. | "Fair Use" is also common in German |
| fr | keyboard:tone.warm | Chaleureux | Tone chip; agrees with "ton" (masc.) |
| fr | keyboard:tone.funny | Drôle | Tone chip |
| fr | keyboard:tone.flirty | Flirt | Tone chip; noun to avoid "Charmeur/Charmeuse" |
| fr | keyboard:tone.confident | Assuré | Tone chip; masc. agreement, see note. Alternative "Confiance" |
| fr | keyboard:tone.calm | Calme | Tone chip |
| fr | keyboard:tone.apologise | S’excuser | Tone chip |
| fr | keyboard:tone.sayNoKindly | Non, gentiment | Tone chip (14, at the limit); alternative "Refus en douceur" is 16 and too long |
| fr | keyboard:tone.professional | Professionnel | Tone chip; masc. agreement |
| fr | keyboard:relationship.friend | Amitié | Avoids "Ami/Amie"; alternative "Pote" (epicene but slangy) |
| fr | keyboard:closeness.* | Tout début · On se découvre · Amical · Proche · Très proche | Does the scale read naturally? "On se découvre" is 14 |
| fr | keyboard:chipRows.flirt | Dose de flirt | "Niveau de flirt" is 15, too long |
| fr | keyboard:chipRows.formality | Registre | Values Décontracté / Formel; would "Tu / Vous" be clearer? |
| fr | keyboard:flirt.playful | Taquin | Masc., agrees with "flirt" |
| fr | common:actions.polish | Peaufiner | "Polish" button; alternative "Améliorer" |
| fr | common:actions.more | ↻ Autres | "↻ Plus" is ambiguous |
| fr | keyboard:counter.leftToday_* | {{count}} restante(s) aujourd’hui | Feminine, agreeing with the implied "réponse(s)"; French "one" also covers 0 |
| fr | common:aiSuggestion | Suggestion de l’IA | AI Act label; "Suggestion IA" is shorter |
| fr | keyboard:bar.noFullAccess | … La saisie marche sans. | Is it natural for "typing works without it"? |
| es | keyboard:tone.warm | Cálido | Tone chip; masc., agrees with "tono" |
| es | keyboard:tone.funny | Divertido | Tone chip; masc. |
| es | keyboard:tone.flirty | Coqueto | Tone chip; masc. Alternative "Ligón" is more slangy |
| es | keyboard:tone.confident | Seguro | Tone chip; masc., see note |
| es | keyboard:tone.calm | Tranquilo | Tone chip; masc. |
| es | keyboard:tone.apologise | Disculparse | Tone chip |
| es | keyboard:tone.sayNoKindly | No, con cariño | Tone chip (14, at the limit); "cariño" may be too warm for work. Alternative "No, con tacto" |
| es | keyboard:tone.professional | Profesional | Tone chip |
| es | keyboard:closeness.* | Nuevo contacto · Conociéndonos · Cordial · Cercanía · Mucha cercanía | Nouns used to avoid "cercano/a"; does the scale read well? |
| es | keyboard:chipRows.closeness | Confianza | Row label differs from the value words to avoid repeating "Cercanía" |
| es | keyboard:chipRows.flirt | Flirteo | "Nivel de flirteo" is 16, too long |
| es | keyboard:relationship.match | Match | Dating-app loanword, common in Spain |
| es | common:actions.polish | Pulir | "Polish" button; alternative "Mejorar" |
| es | common:promise | La respuesta acertada, en cualquier chat | Fixed line; alternatives "justa" / "perfecta" |
| es | keyboard:bar.quotaEmpty | … o pásate al plan ilimitado en la app Replywise. | Phrasing chosen to avoid gendered "ilimitado/a" for the user |
| it | keyboard:tone.warm | Caloroso | Tone chip; masc., agrees with "tono" |
| it | keyboard:tone.funny | Divertente | Tone chip |
| it | keyboard:tone.flirty | Flirt | Tone chip; noun to avoid "civettuolo/a" |
| it | keyboard:tone.confident | Sicuro | Tone chip; masc., see note |
| it | keyboard:tone.calm | Calmo | Tone chip; masc. |
| it | keyboard:tone.apologise | Scusarsi | Tone chip |
| it | keyboard:tone.sayNoKindly | No, con garbo | Tone chip |
| it | keyboard:tone.professional | Professionale | Tone chip |
| it | keyboard:closeness.* | Primo contatto · Conoscendoci · Amichevole · In confidenza · Legame stretto | Order of the last two steps: is "Legame stretto" clearly closer than "In confidenza"? |
| it | keyboard:chipRows.flirt | Livello flirt | Slightly telegraphic; "Livello di flirt" is 16 |
| it | keyboard:flirt.off | Spento | Alternative "No" |
| it | common:actions.polish | Migliora | "Polish" button; alternative "Rifinisci" |
| it | common:status.stepOf | Passaggio {{current}} di {{total}} | Alternative "Fase" |
| it | paywall:fairUse | Uso corretto: fino a 100 risposte al giorno. | Alternative "Uso equo" |
| all | keyboard:bar.noFullAccessPath | see note above | Full Access toggle label not confirmed from an Apple source |

## Added after review (main session, needs a native check)

| Language | Key | Translation | Why check |
|---|---|---|---|
| fr | keyboard:counter.leftToday_one / _other | {{count}} restante / {{count}} restantes | Shortened to fit the 14-character chip limit with a two-digit count; "aujourd’hui" dropped |
| es | keyboard:counter.leftToday_one / _other | Queda {{count}} / Quedan {{count}} | Same: "hoy" dropped to fit 14 characters |
| it | keyboard:counter.leftToday_one / _other | Ancora {{count}} | Same: "oggi" dropped to fit 14 characters |
| de/fr/es/it | common:status.info, success, warning, error | see common.json | Screen-reader words for banner severity |
| de/fr/es/it | common:status.stepDone, stepCurrent | see common.json | Screen-reader state of a setup step; fr "terminée" agrees with "étape" |
| de/fr/es/it | paywall:plansLabel | see paywall.json | Screen-reader name of the plan list (radio group) |
