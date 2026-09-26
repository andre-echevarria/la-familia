// All the words the narrator reads, in one place so they're easy to edit.

const ROLE_INFO = {
  chusma: { name: 'Chusma', team: 'chusma', blurb: 'You are not in the family. Shift blame to the Primos and do whatever it takes to avoid being discovered.' },
  abuela: { name: 'Abuela', team: 'family', blurb: 'You are in the family. Every Saturday night you can ask about one person and find out if they are Chusma. Help the Primos, but don\'t get discovered!' },
  tio:    { name: 'Cool Tio', team: 'family', blurb: 'You are in the family. Every Saturday night you can vouch for one person and save them if they get blamed. You can vouch for yourself only once, and never the same person two rounds in a row.' },
  tia:    { name: 'Tell-All Tia', team: 'family', blurb: 'You are in the family and tell it like it is. When you get eliminated, you can ask about one person, in front of everyone!' },
  sheep:  { name: 'Black Sheep', team: 'family', blurb: 'You are in the family. As a bad influence, you can take another person out with you when you get eliminated.' },
  primo:  { name: 'Primo', team: 'family', blurb: 'You are in the family. You need to get rid of the Chusma before they ruin everything!' },
  prima:  { name: 'Prima', team: 'family', blurb: 'You are in the family. You need to get rid of the Chusma before they ruin everything!' },
};

const SCENARIOS = [
  'Someone broke the radio and stopped the party.',
  'Someone ate all the leftovers and didn\'t return the Tupperware containers.',
  'Someone clogged the toilet and now we have to pay for a plumber.',
  'Someone trampled Abuela\'s beloved garden. Major no-no.',
  'Someone fed the dog table scraps and now he is very gassy.',
  'Someone left the door open and the pets ran away.',
  'Someone used "the good towel" in the bathroom. Family knows better than that.',
  'Someone spilled a drink on the couch and left a stain. The stain is shaped like Puerto Rico.',
  'Someone left the door open and now the house is full of mosquitoes.',
  'Someone drew mustaches on the family portrait.',
];

const SCRIPT = {
  intro: [
    'Here is the background story. It\'s Sunday and the family is getting together.',
    'Family members are invited, but there are a few Chusma (riff-raff) in the mix, posing as primos, who are not part of the family. They keep showing up and causing chaos.',
    'Your job is to work as a family to find out who the Chusma are and uninvite them from the family parties. Good luck!',
    'Everyone, press and hold your card to peek at your role. Keep it a secret! Tap "Got it" when you\'re ready.',
  ],
  roles: [
    'Abuela can find out every Saturday night if someone is Chusma. If she\'s too vocal, she\'ll get found out!',
    'The Cool Tio can vouch for one person every Saturday night. If they get blamed, they\'re safe.',
    'The Tell-All Tia, when she gets eliminated, can ask about one person in front of everyone.',
    'The Black Sheep is a bad influence. When eliminated, they take another person out with them.',
    'The Primos and Primas help decide who is the Chusma and uninvite them before they ruin everything!',
    'The Chusma are not part of the family. They create chaos and shift the blame.',
  ],
  night: [
    'It\'s Saturday and everyone is invited to the family party. To prepare, everyone is practicing their dancing. Mesmerized by the music, the whole family dances along on their phones.',
    'While the music plays, the Chusma plan a different kind of move. They scheme on who to blame for the next round of chaos.',
    'While cooking, the Abuela hears the music and it reminds her of an old party. Her photographic memory will tell her if someone doesn\'t belong.',
    'The Cool Tio always has your back. He is the perfect alibi and willing to cover for you any time.',
  ],
  wake: 'It is now Sunday and it\'s time for the party. Everyone stop dancing!',
  sundayOpen: 'It\'s the Sunday party! This Sunday\'s get-together was another great time. There was dancing, great food and hanging out, but at the end of the night we noticed...',
  blamed: n => `The Chusma left clues incriminating ${n}, and they have been blamed!`,
  saved: n => `But wait! The Cool Tio vouched for ${n}. They are safe this round!`,
  outBlamed: n => `${n} has to pay the price and is out of the game.`,
  voteOpen: secs => `The Family is sure this is the work of the Chusma and decided to investigate and vote them out. You have ${Math.round(secs / 60)} minutes to discuss. Agree together, or when time is up everyone votes on their phone. Your time starts now...`,
  tieOpen: (names, secs) => `It's a tie between ${names}! You have ${secs} more seconds to discuss, then everyone votes again between just them.`,
  verdict: n => `The Family has decided, and the person who will not be invited to the next party is... ${n}. I am sorry, you are not welcome at the family party.`,
  tiaAsk: n => `${n} was the Tell-All Tia! She gets to ask about one person, in front of everyone...`,
  tiaResult: (t, yes) => yes ? `The Tia asked about ${t}... and ${t} IS a Chusma!` : `The Tia asked about ${t}... and ${t} is NOT a Chusma.`,
  sheepAsk: n => `${n} was the Black Sheep! As a bad influence, they get to take someone down with them...`,
  sheepHit: (t) => `The Black Sheep takes ${t} down with them! ${t} is out of the game.`,
  sheepSaved: (t) => `The Black Sheep tried to take ${t} down, but the Cool Tio vouched for them this round. ${t} is safe!`,
  recap: 'To recap, we still have:',
  familyWins: 'The Family wins! All the Chusma have been uninvited from the party. The family is safe... until next Sunday.',
  chusmaWins: 'The Chusma win! They took over the family party. Better luck next time, familia.',
};

module.exports = { ROLE_INFO, SCENARIOS, SCRIPT };
