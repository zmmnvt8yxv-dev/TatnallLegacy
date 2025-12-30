import { Card, Text, Title } from '@tremor/react';

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <Card className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
      <Title className="text-white">{title}</Title>
      <Text className="mt-2 text-sm text-slate-300">{description}</Text>
      <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-400">
        This section is ready for detailed analytics, custom tables, and league-specific
        workflows.
      </div>
    </Card>
  );
}
