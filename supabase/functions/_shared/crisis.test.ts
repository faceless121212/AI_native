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
    // Everyday idioms that must not show a crisis card (Prompt 4 list review)
    'My mum is going to kill me if I am late again',
    'Ab morgen werde ich zwei Wochen nicht mehr da sein, Urlaub!',
    'Er bringt mich um 8 zum Bahnhof',
    'Meine Mutter wird mich umbringen, wenn ich zu spät komme',
    'Ce boulot va me tuer',
    "J'ai hâte d'en finir avec ce dossier",
    'Mañana voy a cortarme el pelo',
    'Hoy voy a acabar con todo el trabajo',
    'Questo caldo mi uccide',
    'Facciamola finita con questa discussione, andiamo a cena',
    'It is only 5 kms away',
  ];
  for (const text of calm) assertEquals(looksLikeCrisis(text), false, text);
});
