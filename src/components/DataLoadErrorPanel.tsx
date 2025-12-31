type DataLoadErrorPanelProps = {
  title?: string;
  message?: string;
  url?: string;
  status?: number;
};

export function DataLoadErrorPanel({
  title = "Unable to load data.",
  message,
  url,
  status,
}: DataLoadErrorPanelProps) {
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600">
      <p className="font-semibold text-red-600">{title}</p>
      {message && <p className="mt-1 text-xs text-red-500">{message}</p>}
      <dl className="mt-3 space-y-1 text-xs text-red-500">
        <div>
          <dt className="font-medium text-red-600">Request URL</dt>
          <dd className="break-all">{url ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="font-medium text-red-600">HTTP status</dt>
          <dd>{status ?? "Unknown"}</dd>
        </div>
      </dl>
    </div>
  );
}
