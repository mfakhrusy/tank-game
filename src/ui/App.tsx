import { Workshop } from './Workshop';
import { TestYard } from './TestYard';
import { useGameStore } from '../store';

export function App() {
  const mode = useGameStore((state) => state.mode);
  return mode === 'workshop' ? <Workshop /> : <TestYard />;
}
