import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <EmptyState
      className="mt-10"
      icon={<Compass className="h-5 w-5" />}
      title="Off the published route"
      body="This page doesn't exist. Head back to your overview or logbook."
      action={<><Link to="/" className="btn-primary">Overview</Link><Link to="/flights" className="btn-glass">My Flights</Link></>}
    />
  );
}
