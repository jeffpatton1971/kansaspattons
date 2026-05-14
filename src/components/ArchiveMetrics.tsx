import { BookOpen, CalendarDays, Images } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchHomeSummary } from '../content';
import { useAsyncData } from '../hooks';

export function ArchiveMetrics() {
  const state = useAsyncData(fetchHomeSummary, []);

  if (state.status === 'loading') {
    return (
      <Card className="metrics-stack" aria-label="Archive totals">
        <CardContent className="grid gap-3 pt-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'error') {
    return null;
  }

  const { counts, sourceCounts = [] } = state.data;
  const metrics = [
    { href: '/posts', label: 'posts', value: counts.posts, icon: CalendarDays },
    { href: '/stories', label: 'stories', value: counts.stories, icon: BookOpen },
    { href: '/galleries', label: 'galleries', value: counts.galleries ?? 0, icon: Images },
    { href: '/images', label: 'images', value: counts.images, icon: Images },
  ];

  return (
    <div className="metrics-stack" aria-label="Archive totals">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Archive</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <Link
                className="group flex min-h-14 items-center gap-3 rounded-lg border border-border/80 bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/45 hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                to={metric.href}
                key={metric.href}
              >
                <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <span className="grid gap-0.5">
                  <strong className="text-lg leading-none text-foreground">{metric.value.toLocaleString()}</strong>
                  <span className="text-xs font-medium uppercase">{metric.label}</span>
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
      {sourceCounts.length > 0 ? (
        <Card size="sm" aria-label="Source filters">
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Separator />
            {sourceCounts.map((item) => (
              <Badge
                asChild
                className={`h-9 w-full justify-between rounded-lg px-3 ${sourceClassName(item.source)}`}
                variant="outline"
                key={item.source}
              >
                <Link to={item.href}>
                  <span>{item.label}</span>
                  <strong>{item.count.toLocaleString()}</strong>
                </Link>
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function sourceClassName(source: string) {
  if (source === 'wordpress') {
    return 'border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100';
  }

  if (source === 'instagram') {
    return 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100';
  }

  if (source === 'facebook') {
    return 'border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100';
  }

  return 'bg-background';
}
