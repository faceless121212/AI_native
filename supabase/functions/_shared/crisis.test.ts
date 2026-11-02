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
  ];
  for (const text of calm) assertEquals(looksLikeCrisis(text), false, text);
});
