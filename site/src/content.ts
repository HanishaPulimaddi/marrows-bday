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
    paragraphs: [
      'Happy birthday, my love.',
      "I don't think words will ever be enough to tell you how much you mean to me, but today I want to try. Thank you for being the person who makes my heart feel that little bit lighter. Thank you for every laugh, every walk, every little conversation that turned into something bigger than it needed to be.",
      "As long as I have you, I know I'll always have somewhere to come home to. I love your kindness, your patience, your stubborn hope, and the way you care for the people around you — even on the days it costs you something.",
      'I am so grateful to know you, and to be loved by you.',
    ],
    photos: [
      { alt: 'Marion', src: '/images/LetterHeroPotrait.jpeg' },
      { alt: 'Marion, two', src: '/images/Letter1.jpeg' },
      { alt: 'Marion, three', src: '/images/Letter2.jpeg' },
      { alt: 'Marion, four', src: '/images/Letter3.jpeg' },
    ],
  },
};
