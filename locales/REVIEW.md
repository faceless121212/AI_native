# Native-speaker review: Prompt 1 locale strings

Source: `locales/en`. Translations: de, fr, es (Spain), it. Informal address throughout (du / tu / tú / tu).
Every tone chip label is listed here because they are product labels, not literal translations.

Notes that apply to more than one language:
- **Gender of tone adjectives (fr, es, it):** the adjectives agree with the masculine noun "ton / tono" (a "warm tone"). They do not describe the user, but a woman could read e.g. "Assuré" / "Seguro" / "Sicuro" as being about herself. Please confirm this reads as describing the tone, or suggest an epicene or noun form.
- **Relationship chips** describe the other person. To avoid assuming gender, we used epicene words (fr Partenaire, Collègue; es Pareja, Colega; it Partner, Collega) or category nouns (de Freundeskreis, fr Amitié, es Amistad, it Amicizia; de Arbeit).
- **iOS Settings path (`keyboard:bar.noFullAccessPath`):** Apple's localised iPhone User Guide (iOS 27, "Add or change keyboards") confirms Settings → General → Keyboard → Keyboards as **Einstellungen → Allgemein → Tastatur → Tastaturen**, **Réglages → Général → Clavier → Claviers**, **Ajustes → General → Teclado → Teclados**, **Impostazioni → Generali → Tastiera → Tastiere**. I couldn't load an Apple page showing the "Allow Full Access" toggle, so that label comes from memory (fairly confident): de "Vollen Zugriff erlauben", fr "Autoriser l’accès complet", es "Permitir acceso total", it "Consenti accesso completo". **Check it on a real device in each language.**
- **Store subscription screens (`notifications:trialEndsTomorrowIos` / `trialEndsTomorrowAndroid`):** these replaced `trialEndsTomorrow`, because you cancel in the store, not in the phone's Settings app. "App Store" and "Google Play" stay as they are. The subscription screen names are written from memory, not from a store page I could open. App Store, very confident: de "Abonnements", fr "Abonnements", es "Suscripciones", it "Abbonamenti". Google Play, fairly confident: de "Abos" (under "Zahlungen und Abos"), fr "Abonnements", es "Suscripciones", it "Abbonamenti". **Check both stores on a real device in each language.**

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
| de | keyboard:bar.lastTrialDay | Deine Testphase endet morgen, danach {{price}}/Jahr. Verwalten in der Replywise-App. | "Verwalten" is an infinitive used as an instruction |
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
| all | keyboard:bar.noFullAccessPath | see note above | Full Access toggle label not confirmed from an Apple source |

## Added after review (main session, needs a native check)

| Language | Key | Translation | Why check |
|---|---|---|---|
| fr | keyboard:counter.leftToday_one / _other | {{count}} restante / {{count}} restantes | Shortened to fit the 14-character chip limit with a two-digit count; "aujourd’hui" dropped |
| es | keyboard:counter.leftToday_one / _other | Queda {{count}} / Quedan {{count}} | Same: "hoy" dropped to fit 14 characters |
| it | keyboard:counter.leftToday_one / _other | Ancora {{count}} | Same: "oggi" dropped to fit 14 characters |
| de/fr/es/it | common:status.info, success, warning, error | see common.json | Screen-reader words for banner severity |
| de/fr/es/it | common:status.stepDone, stepCurrent | see common.json | Screen-reader state of a setup step; fr "terminée" agrees with "étape" |

## Copy change: data line and trial reminder (needs a native check)

| Language | Key | Translation | Why check |
|---|---|---|---|
| de | onboarding:whatWeSee.line2 | Dann geht nur die kopierte Nachricht oder dein Entwurf an unseren KI-Anbieter – verarbeitet in der EU. | Now "or" (Reply sends the message, Polish sends the draft). Singular verb "geht" |
| fr | onboarding:whatWeSee.line2 | Quand tu touches un de ces boutons, seul le message copié ou ton brouillon est envoyé à notre fournisseur d’IA, et traité dans l’UE. | "seul … ou …" with singular agreement |
| es | onboarding:whatWeSee.line2 | Cuando tocas, solo el mensaje copiado o tu borrador va a nuestro proveedor de IA, que lo procesa en la UE. | Singular "va" / "lo" |
| it | onboarding:whatWeSee.line2 | Quando tocchi, solo il messaggio copiato o la tua bozza va al nostro fornitore di IA, con elaborazione nell’UE. | Rephrased ending ("con elaborazione") to avoid choosing between "elaborato"/"elaborata" |
| de | notifications:trialEndsTomorrowIos | … Du kannst jederzeit in deinen Abonnements im App Store kündigen. | App Store screen name "Abonnements" |
| de | notifications:trialEndsTomorrowAndroid | … Du kannst jederzeit in deinen Abos bei Google Play kündigen. | Google Play screen name "Abos"; "bei" vs "in" Google Play |
| fr | notifications:trialEndsTomorrowIos / Android | … Tu peux annuler à tout moment dans tes abonnements App Store / Google Play. | Store screen name "Abonnements" |
| es | notifications:trialEndsTomorrowIos / Android | … Cancela cuando quieras en tus suscripciones del App Store / de Google Play. | "del App Store" (masc.) vs "de Google Play" |
| it | notifications:trialEndsTomorrowIos / Android | … Puoi annullare quando vuoi nei tuoi abbonamenti dell’App Store / di Google Play. | "dell’App Store" vs "di Google Play" |

## Prompt 5: iOS keyboard keys (needs a native check on a real iPhone)

`keyboard:keys.*` are VoiceOver labels and hints. `keyboard:returnKey.*` are the visible return-key labels and should match what Apple's own keyboard shows in each language. I wrote all of these from memory because I couldn't open an Apple source. **Compare each one with the system keyboard on a device set to that language**, using the matching field types: URL (go), search, Messages (send), Wi-Fi password (join), Maps (route), emergency call.
Casing: German capitalises its nouns and verbs on keys. fr, es and it use lower case like en, but "OK" stays upper case.

| Language | Key | Translation | Confidence / why check |
|---|---|---|---|
| de | keyboard:keys.shift / capsLock | Umschalt / Feststelltaste | Fairly sure |
| de | keyboard:keys.delete / space | Löschen / Leerzeichen | Sure; "Leerzeichen" is the visible space bar label |
| de | keyboard:keys.numbers / letters / moreSymbols | Zahlen / Buchstaben / Weitere Symbole | Fairly sure; "Ziffern" is an alternative for numbers |
| de | keyboard:keys.alternativesHint | Streiche nach oben oder unten für weitere Zeichen. | Apple's German guides use "streichen"; "Wische" is an alternative |
| de | keyboard:returnKey.default | Return | Fairly sure; check it isn't "Zeilenschaltung" or a ⏎ symbol in current iOS |
| de | keyboard:returnKey.go / search / send / done / next | Öffnen / Suchen / Senden / Fertig / Weiter | Fairly sure |
| de | keyboard:returnKey.join | Verbinden | Unsure. The brief suggested "Beitreten", but I think iOS shows "Verbinden" for Wi-Fi join |
| de | keyboard:returnKey.route / continue / emergencyCall | Route / Weiter / Notruf | Fairly sure; "continue" and "next" are both "Weiter" |
| fr | keyboard:keys.shift / capsLock | Majuscule / Verrouillage des majuscules | Fairly sure |
| fr | keyboard:keys.delete / space | Supprimer / espace | Sure |
| fr | keyboard:keys.numbers / letters / moreSymbols | Chiffres / Lettres / Plus de symboles | Fairly sure; "Symboles" is an alternative |
| fr | keyboard:keys.alternativesHint | Balaie vers le haut ou le bas pour plus de caractères. | Informal "tu" form of Apple's "Balayez" |
| fr | keyboard:returnKey.default / go / search / send | retour / aller / rechercher / envoyer | Fairly sure |
| fr | keyboard:returnKey.done | OK | Fairly sure (Apple FR "Done" = "OK") |
| fr | keyboard:returnKey.next / join / continue | suivant / rejoindre / continuer | Medium; "rejoindre" is the least sure |
| fr | keyboard:returnKey.route | itinéraire | Medium |
| fr | keyboard:returnKey.emergencyCall | appel d’urgence | Medium; 15 characters, so check it fits the key. "urgence" is shorter |
| es | keyboard:keys.shift / capsLock | Mayúsculas / Bloqueo de mayúsculas | Fairly sure |
| es | keyboard:keys.delete / space | Borrar / espacio | Sure |
| es | keyboard:keys.numbers / letters / moreSymbols | Números / Letras / Más símbolos | Fairly sure |
| es | keyboard:keys.alternativesHint | Desliza hacia arriba o hacia abajo para ver más caracteres. | Fine |
| es | keyboard:returnKey.default / go / search / send | intro / ir / buscar / enviar | Fairly sure |
| es | keyboard:returnKey.done | OK | Fairly sure (Apple ES "Done" = "OK") |
| es | keyboard:returnKey.next / continue / route | siguiente / continuar / ruta | Medium |
| es | keyboard:returnKey.join | conectarse | Unsure; "unirse" or "conectar" are alternatives |
| es | keyboard:returnKey.emergencyCall | emergencia | Unsure; shortened because "llamada de emergencia" (21) won't fit a key |
| it | keyboard:keys.shift / capsLock | Maiuscole / Blocco maiuscole | Fairly sure |
| it | keyboard:keys.delete / space | Elimina / spazio | Sure |
| it | keyboard:keys.numbers / letters / moreSymbols | Numeri / Lettere / Altri simboli | Fairly sure |
| it | keyboard:keys.alternativesHint | Scorri verso l’alto o verso il basso per altri caratteri. | Apple IT uses "scorri" for swipe |
| it | keyboard:returnKey.default / go / search / send | invio / vai / cerca / invia | Fairly sure |
| it | keyboard:returnKey.done / next / continue | fine / avanti / continua | Medium; check whether iOS shows "fine" in lower case |
| it | keyboard:returnKey.join | accedi | Unsure; "connetti" is an alternative |
| it | keyboard:returnKey.route | percorso | Medium; "itinerario" is an alternative |
| it | keyboard:returnKey.emergencyCall | emergenza | Unsure; shortened from "chiamata d’emergenza" (20) |

## Shift state for VoiceOver (main session, 2026-11-05)

| Language | Key | Translation | Why check |
|---|---|---|---|
| de | keyboard:keys.shiftOn / shiftOff | ein / aus | VoiceOver value of the shift key; Apple uses ein/aus for switches |
| fr | keyboard:keys.shiftOn / shiftOff | activé / désactivé | Same; masculine agrees with « le Maj » |
| es | keyboard:keys.shiftOn / shiftOff | activado / desactivado | Same |
| it | keyboard:keys.shiftOn / shiftOff | attivo / disattivato | Same; check whether VoiceOver says "attivato" |

## Product decisions 2026-11-13: annual only, new onboarding, sign-in (needs a native check)

Removed with the weekly and lifetime plans and the in-app paywall (the paywall is now a RevenueCat Paywall; its copy is localised in the RevenueCat dashboard, not here): `paywall:trialTimeline`, `paywall:perWeek`, `paywall:lifetimeLine`, `paywall:fairUse`, `paywall:plansLabel`.

Changed: the price period in `keyboard:bar.lastTrialDay`, `notifications:trialEndsTomorrowIos` and `notifications:trialEndsTomorrowAndroid` is now per year (en /year, de /Jahr, fr /an, es /año, it /anno).

New (first drafts by Claude, no native review yet). The "Continue with Apple" button is the system `AppleAuthenticationButton`, localised by iOS, so it has no string here.

| Language | Key | Translation | Why check |
|---|---|---|---|
| de | onboarding:age.actions.adult | Ich bin 18+, los geht’s | Button (23 of 24) |
| fr | onboarding:age.actions.adult | J’ai 18 ans ou plus | Drops "let's go": "J’ai 18+, c’est parti" reads oddly and longer forms pass 24 |
| es | onboarding:age.actions.adult | Tengo 18 o más, ¡vamos! | Button (23 of 24) |
| it | onboarding:age.actions.adult | Ho 18+ anni, iniziamo | "18+ anni" is informal; alternative "Sono maggiorenne" |
| de/fr/es/it | onboarding:age.under18Stop | see onboarding.json | Spec §2 stop-screen copy |
| de | onboarding:keyboardSetup.actions.done | Hab ich gemacht | "I've done it"; alternative "Erledigt" |
| fr | onboarding:keyboardSetup.actions.openSettings | Ouvrir les réglages | iOS app is "Réglages", Android "Paramètres"; one label for both |
| es | onboarding:keyboardSetup.actions.openSettings | Abrir Ajustes | iOS "Ajustes"; Android "Ajustes" too on most phones |
| it | onboarding:keyboardSetup.actions.done | Fatto | Short; alternative "L’ho fatto" |
| fr | paywall:reminderSwitch | Me rappeler avant la fin de l’essai | Switch label on the paywall |
| de/fr/es/it | common:actions.signIn / signOut | Anmelden/Abmelden · Se connecter/Se déconnecter · Iniciar sesión/Cerrar sesión · Accedi/Esci | Settings row |
| de/fr/es/it | paywall:fairUse_one / _other | see paywall.json | Fair-use line under the paywall; reuses the earlier fairUse wording, now with {{count}} |
| de/fr/es/it | onboarding:signIn.notice / privacyLink | see onboarding.json | Sign-in notice, changed 2026-11-13 to "We use your Apple or Google sign-in only to keep your plan on all your devices."; de/fr use "Abo" / "abonnement" for "plan" |
| de/fr/es/it | common:deleteData.subscriptionWarningIos / Android, common:actions.manageSubscription | see common.json | Warning before Delete my data; store screen names as in the trial notifications |

## 2026-11-13 answers: Apple / Google sign-in only, signed-out state (needs a native check)

Removed with email + password sign-in: `onboarding:signIn.actions.email`, `onboarding:signIn.actions.forgotPassword`, `onboarding:signIn.emailLabel`, `onboarding:signIn.passwordLabel`.

| Language | Key | Translation | Why check |
|---|---|---|---|
| de/fr/es/it | keyboard:bar.signedOut | see keyboard.json | Keyboard bar message after Sign out |
| de/fr/es/it | keyboard:actions.openApp | App öffnen · Ouvrir l’app · Abrir la app · Apri l’app | Bar action |
| fr | common:signedOutCard.body | Ta session est fermée, … | Avoids a gendered participle ("déconnecté·e") |
| it | common:signedOutCard.body | Hai effettuato l’uscita, … | Avoids the gendered "uscito/a" |
| de/fr/es/it | common:signedOutCard.title / body | see common.json | Home sign-in card after Sign out |
