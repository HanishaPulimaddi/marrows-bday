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
      { caption: 'Your smile', alt: 'Marion smiling' },
      { caption: 'Your hugs', alt: 'A hug' },
      { caption: 'Your patience', alt: 'Marion, patient as ever' },
      { caption: 'Your kindness', alt: 'A moment of kindness' },
      { caption: 'The way you make me laugh', alt: 'Laughing together' },
      { caption: 'Everything about you', alt: 'Marion' },
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
    moreLabel: 'ONE MORE THING →',
    moreHref: '/app',
    photos: [
      { alt: 'Marion, one' },
      { alt: 'Marion, two' },
      { alt: 'Marion, three' },
      { alt: 'Marion, four' },
    ],
  },
};
