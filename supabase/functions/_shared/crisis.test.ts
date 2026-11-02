import { assertEquals } from 'jsr:@std/assert@1';
import { looksLikeCrisis } from './crisis.ts';

Deno.test('crisis backstop: clear phrases in all five languages, accents and case ignored', () => {
  const crisis = [
    "I can't do this anymore, I want to die",
    'thinking about suicide tonight',
    'He said he is going to kill me',
    'Ich will nicht mehr leben',
    'Ich denke an Suizid',
    'Ich will mir das Leben nehmen',
    "Je n'ai plus envie de vivre",
    'je vais me suicider',
    'Quiero morirme, ya no puedo',
    'voy a hacerme daño',
    'Non voglio più vivere',
    'ho pensato di togliermi la vita',
    'MI VUOLE UCCIDERE',
    // Added in Prompt 4 (list review)
    'Honestly everyone would be better off without me',
    "I'm scared for my life, he's outside",
    'Ich will mir was antun',
    'Er droht mich umzubringen',
    "J'ai envie d'en finir",
    'Il menace de me tuer',
    'Quiero acabar con todo',
    'Estoy en peligro, ven por favor',
    'Sto pensando di farla finita',
    'Ho paura per la mia vita',
    // Code review (recall): must match
    'I cut myself last night',
    'I hurt myself on purpose',
    "I've been hurting myself again",
    'my boyfriend is going to kill me',
    "he's gonna kill me",
    'he will kill me',
    'Er wird mich umbringen',
    'Mein Mann bringt mich um',
    'Je veux en finir',
    'Mon mec va me tuer',
    'Mi novio me va a matar',
    'Mi marito mi ammazza',
    'Mi ammazza, aiuto',
    'Me quiero matar',
    'me voy a matar',
    'Me voy a suicidar',
    'Mi voglio uccidere',
    'mi uccido',
    'mi ammazzo',
    'ich will mich töten',
    'ich möchte sterben',
  ];
  for (const text of crisis) assertEquals(looksLikeCrisis(text), true, text);
});

Deno.test('crisis backstop: ordinary messages do not trigger it', () => {
  const calm = [
    'That movie was killer, I died laughing',
    'Wie war dein Wochenende?',
    'On se voit demain ?',
    '¿Quedamos para cenar?',
    'Che bello vederti!',
    'This traffic is killing me',
    '[email] [phone]',
    // Unambiguous everyday phrases that must not show a crisis card. Ambiguous idioms ("my mum
    // is going to kill me") match on purpose: the backstop leans to recall.
    'Ab morgen werde ich zwei Wochen nicht mehr da sein, Urlaub!',
    'Er bringt mich um 8 zum Bahnhof',
    'Sie bringt mich um halb neun nach Hause',
    "J'ai hâte d'en finir avec ce dossier",
    'Mañana voy a cortarme el pelo',
    'Hoy voy a acabar con todo el trabajo',
    'Facciamola finita con questa discussione, andiamo a cena',
    'It is only 5 kms away',
  ];
  for (const text of calm) assertEquals(looksLikeCrisis(text), false, text);
});
