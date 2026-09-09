import { HeroPoster } from './components/HeroPoster';
import { ReasonsRail } from './components/ReasonsRail';
import { LetterTape } from './components/LetterTape';
import { VinylPage } from './pages/VinylPage';
import { useHashRoute } from './hooks/useHashRoute';

export default function App() {
  const route = useHashRoute();

  /* new standalone route; anything else falls through to the original deck */
  if (route === '/vinyl') return <VinylPage />;

  return (
    <main className="deck">
      <HeroPoster nextId="reasons" />
      <ReasonsRail />
      <LetterTape />
    </main>
  );
}
