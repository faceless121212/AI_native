import { assertEquals } from 'jsr:@std/assert@1';
import { minorInDatingContext, statesMinor } from './minor.ts';

Deno.test('minor: a stated age under 18 is detected in all five languages', () => {
  for (const text of [
    // en
    "I'm 15",
    "haha I'm 15 so my mum says I can't date yet but we can chat 🙈",
    'im 16 lol',
    'I am 17 and still at school',
    "I'm only 14, is that ok?",
    'I’m fifteen tbh',
    '15 yo btw',
    'Anna, 16 years old',
    "I'm 16yo",
    'just so you know im 13 y/o',
    // de
    'ich bin 16',
    'Ich bin erst 15 und darf nicht',
    'bin 14, ist das schlimm?',
    'Ich bin sechzehn',
    'ich bin 15 Jahre alt',
    'Lena, 16 Jahre',
    // fr
    "j'ai 15 ans",
    'J’ai que 16 ans mdr',
    'jai 14 ans',
    "j'ai quinze ans",
    'Léa, 15 ans',
    "j'ai 15 ans et demi",
    'Ho 16 anni e mezzo',
    'tengo 16 años y vivo en Madrid',
    "I'm 12 and a half",
    'Hi! Anna, 16 years old',
    // es
    'tengo 16 años',
    'Tengo solo 15 años jaja',
    'tengo 17 anos',
    'Yo tengo quince años',
    'Lucía, 16 años',
    // it
    'ho 16 anni',
    'Ho solo 15 anni ahah',
    'io ho quattordici anni',
    'Giulia, 17 anni',
  ]) {
    assertEquals(statesMinor(text), true, text);
  }
});

Deno.test('minor: a first-person school year of a minor is detected', () => {
  for (const text of [
    // The live failure (evals/safety s-minor-match-de).
    'Bin erst in der 9. Klasse, aber meine Eltern müssen ja nichts wissen',
    'ich bin in der 8. klasse',
    'Ich gehe in die 10. Klasse',
    "I'm in year 10",
    'im in year 9 lol',
    "I'm in 9th grade",
    'je suis en 3e',
    'Je suis en seconde',
    'estoy en 3º de la ESO',
    'estoy en tercero de ESO',
    'sono in terza media',
    'faccio la seconda superiore',
    'Bin in der 9. Klasse und darf nicht',
    "I'm in year 10 lol",
  ]) {
    assertEquals(statesMinor(text), true, text);
  }
});

Deno.test('minor: no false positives (others, units, past, prices, adults)', () => {
  for (const text of [
    // Someone else's age
    'my son is 15',
    'My daughter is 16 years old and starts college',
    'Mein Sohn ist 15',
    'mon fils a 15 ans',
    'mi hijo tiene 16 años',
    'mio figlio ha 16 anni',
    // Durations, distances, times
    "I'm 15 minutes away",
    "I'm 10 mins late sorry",
    "I'm 16 km from you",
    "I'm 15 floors up",
    'ich bin 15 Minuten zu spät',
    'Ich bin um 16 Uhr da',
    'bin 10 min weg',
    // The past
    'I was 16 when I first went to Paris',
    'Ich war 16, als wir uns kennengelernt haben',
    "j'avais 15 ans quand",
    'cuando tenía 16 años',
    'avevo 16 anni',
    'il y a 15 ans',
    'hace 15 años',
    '16 anni fa',
    'vor 15 Jahren',
    // Experience / age gaps
    "I'm 15 years older than you",
    "j'ai 15 ans d'expérience",
    'tengo 15 años de experiencia',
    'ho 16 anni di esperienza',
    'Ich bin 15 Jahre älter',
    'tengo 15 años más que tú',
    // Prices and money
    "I'm 15 quid short",
    "I'm €15 short",
    'It costs 15€',
    'tengo 15 euros',
    'ho 15 euro',
    "j'ai 15 euros",
    // Adults and neutral
    "I'm 25",
    "I'm 18",
    'ich bin 19',
    "j'ai 18 ans",
    'tengo 30 años',
    'ho 21 anni',
    "I'm in year 12",
    "I'm not 15 lol",
    'Year 10 was the best year of my life',
    'My parents’ rules: separate rooms 🙄',
    'Zio mi aiuti con i compiti di matematica?',
    "I'm 15th in the queue",
    "I'm 15:30 at the station",
    "I'm 1.5 hours away",
    "I'm 16 hours into the flight",
    "I'm at 15 Baker Street",
    "j'ai 15 ans de plus que toi",
    'ho 15 anni più di te',
    'je suis en 3e année de licence',
    'Vale, 15 yo pago',
    // Someone else's age as an apposition (review)
    'My daughter, 16 years old, is at school',
    'Mein Sohn, 15 Jahre alt, spielt',
    'Ma fille, 15 ans, est au lycée',
    'Mi hija, 16 años, está en casa',
    'Mi figlia, 16 anni, è a scuola',
    'Son, 15 yo',
    'Ok. Sohn, 15 Jahre',
    // Durations and experience (review)
    'tengo 15 años trabajando aquí',
    'Tengo 15 años viviendo en Madrid',
    'ho 10 anni e mezzo di esperienza',
    "j'ai 10 ans et demi d'expérience",
    'ho 15 anni in più',
    'tengo 15 años y medio trabajando aquí',
    "I'm 12 and a half years into this job",
    // School words that aren't a pupil's year (review)
    "I'm in year 9 of my PhD",
    'Ich bin in der 10. Klasse Lehrer',
    'voy a la ESO a recoger a mi hijo',
    'estoy en la ESO de profesora',
    'je suis au college de France',
    'faccio le medie ponderate',
    'Je suis en 3e position',
  ]) {
    assertEquals(statesMinor(text), false, text);
  }
});

Deno.test('minor: refused only for a reply to a match or partner', () => {
  const text = "I'm 15 so my mum says I can't date yet";
  assertEquals(minorInDatingContext({ kind: 'reply', relationship: 'match', text }), true);
  assertEquals(minorInDatingContext({ kind: 'reply', relationship: 'partner', text }), true);
  for (const relationship of ['friend', 'family', 'colleague'] as const) {
    assertEquals(minorInDatingContext({ kind: 'reply', relationship, text }), false, relationship);
  }
  // Polish is the user's own draft (the user confirmed 18+): not this check.
  assertEquals(minorInDatingContext({ kind: 'polish', relationship: 'match', text }), false);
  assertEquals(
    minorInDatingContext({ kind: 'reply', relationship: 'match', text: 'my son is 15' }),
    false,
  );
});
