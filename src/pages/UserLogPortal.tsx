import { UserLogPanel } from '@/components/UserLogPanel';

type UserLogPortalProps = {
  canAccess: boolean;
};

export function UserLogPortal({ canAccess }: UserLogPortalProps) {
  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-200">
        <h2 className="text-xl font-semibold text-white">User Log Portal</h2>
        <p className="mt-2 text-sm text-slate-300">
          This portal is restricted to the commissioner account. Log in with
          Sleeper username <span className="font-semibold text-white">conner27lax</span>{' '}
          to view the user log.
        </p>
      </div>
    );
  }

  return <UserLogPanel />;
}
