import { HeroPoster } from './components/HeroPoster';
import { ReasonsRail } from './components/ReasonsRail';
import { LetterTape } from './components/LetterTape';

export default function App() {
  return (
    <main className="deck">
      <HeroPoster nextId="reasons" />
      <ReasonsRail />
      <LetterTape />
    </main>
  );
}
