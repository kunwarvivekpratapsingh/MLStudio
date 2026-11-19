import { Link } from 'react-router-dom';
import { Empty } from '@/components/ui';

export function NotFound() {
  return (
    <div className="page">
      <Empty title="This page doesn’t exist" action={<Link className="btn" to="/">Back to projects</Link>}>
        The link may be out of date, or the project was removed.
      </Empty>
    </div>
  );
}
