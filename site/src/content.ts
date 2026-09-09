/* ============================================================================
   Every word and every photo path on the site. Nothing is hard-coded in a
   component - swapping a caption, a name or a real image is an edit here.
   ============================================================================ */

export type PhotoRef = {
  /** leave undefined to render the placeholder */
  src?: string;
  alt: string;
};

export type Reason = PhotoRef & {
  caption: string;
};

export type Content = {
  name: string;
  date: string;
  hero: {
    forLabel: string;
    sideLabel: string;
    /** two lines, deliberately */
    headline: readonly string[];
    oneLiner: string;
    scrollCue: string;
  };
  reasons: {
    label: string;
    headlineLead: string;
    headlineAccent: string;
    dragCue: string;
    items: readonly Reason[];
  };
  letter: {
    label: string;
    paragraphs: readonly string[];
    /** the link out to the playlist page */
    moreLabel: string;
    moreHref: string;
    photos: readonly PhotoRef[];
  };
};

export const content: Content = {
  name: 'Marion',
  date: '09.09.2026',

  hero: {
    forLabel: 'FOR MARION',
    sideLabel: 'A LETTER MADE JUST FOR YOU',
    headline: ['Happy', 'Birthday'],
    oneLiner: 'Happy Birthday, My Love',
    scrollCue: 'SWIPE UP TO EXPLORE',
  },

  reasons: {
    label: 'REASON №',
    headlineLead: 'I Love ',
    headlineAccent: 'You',
    dragCue: 'DRAG →',
    items: [
      { caption: 'Your smile', alt: 'Marion smiling', src: '/images/Reason1.jpeg' },
      { caption: 'Your hugs', alt: 'A hug', src: '/images/Reason2.jpeg' },
      { caption: 'Your patience', alt: 'Marion, patient as ever', src: '/images/Reason3.jpeg' },
      { caption: 'Your kindness', alt: 'A moment of kindness', src: '/images/Reason4.jpeg' },
      { caption: 'The way you make me laugh', alt: 'Laughing together', src: '/images/Reason5.jpeg' },
      { caption: 'Everything about you', alt: 'Marion', src: '/images/Reason6.jpeg' },
    ],
  },

  letter: {
    label: 'A LETTER FOR YOU',
    /* '#/vinyl' is the hash route the app router matches - see useHashRoute */
    moreLabel: 'VIEW PLAYLIST →',
    moreHref: '#/vinyl',
    paragraphs: [
      'Happy birthday, Marrow.',
      "I know I might not write as poetically as Manu, but my writing ain't bad. So here are some words I'd like to express to you on this beautiful occasion of your birthday.",
      "I'm not sure how the memory of our first interaction stayed in your brain, but to me, it was a possessive girl sitting on the bed sulking about why her friends were making a new friend. A girl who pouted. Slightly rude, slightly possessive, slightly blunt. But all I could see was someone who cared so deeply for her friends that she came and cooked us breakfast in the morning. Someone who went to all lengths to cut those apples, bring that pancake mix, make it, and feed it to us.",
      "I remember calling you the mom of the group that day, and you said, \"No, I hate when someone calls me that!\" And while you said that, I truly believe that maybe you're not the mom of the group, but you definitely are the one who cares the most, loves the most, and gives the most.",
      "I really appreciate that you're always there for me. Every call, every message, you always respond. The fact that you're my emergency contact in Sydney should say a lot. I appreciate the people who show up for me, even in small ways: cooking me dinner, sharing information about the diet I should follow or the workout I should do, sending me a bazillion reels every day. And most importantly, always being there to celebrate my achievements. Showing up to my events, swinging by the library just to say hi or bring me a coffee. For that, and for all the things you do that I don't have space to express right now, I am truly, truly grateful.",
      "I know that deep down in your heart, you worry that maybe you won't be loved, or that we'll leave you, or abandon you. I really want you to understand that this is not at all the case. That will not come from me, and I promise you that.",
      'And the reason I say all of this is because I can say it out loud: I love you. Not "admire" — love. Wholeheartedly, from the bottom of my heart, my soul, and every inch of my body knows that it loves Marion.',
    ],
    photos: [
      { alt: 'Marion', src: '/images/LetterHeroPotrait.jpeg' },
      { alt: 'Marion, two', src: '/images/Letter1.jpeg' },
      { alt: 'Marion, three', src: '/images/Letter2.jpeg' },
      { alt: 'Marion, four', src: '/images/Letter3.jpeg' },
    ],
  },
};
