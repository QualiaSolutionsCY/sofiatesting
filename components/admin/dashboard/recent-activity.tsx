import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RecentActivityCardProps = {
  userId: string;
};

export async function RecentActivityCard({
  userId: _userId,
}: RecentActivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-center text-muted-foreground text-sm">
            Analytics feature coming soon
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
