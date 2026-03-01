"use client";

import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ChartProps = {
  data: any[];
  title?: string;
  description?: string;
  className?: string;
};

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col">
            <span className="text-[0.70rem] text-muted-foreground uppercase">
              {label}
            </span>
            <span className="font-bold text-muted-foreground">
              {payload[0].value}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function OverviewChart({
  data,
  title,
  description,
  className,
}: ChartProps) {
  useTheme();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title || "Overview"}</CardTitle>
        <CardDescription>{description || "Activity over time"}</CardDescription>
      </CardHeader>
      <CardContent className="pl-2">
        <ResponsiveContainer height={350} width="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorTotal" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              axisLine={false}
              dataKey="name"
              fontSize={12}
              stroke="#888888"
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              fontSize={12}
              stroke="#888888"
              tickFormatter={(value) => `${value}`}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              dataKey="total"
              fill="url(#colorTotal)"
              fillOpacity={1}
              stroke="#8884d8"
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function BarStatsChart({
  data,
  title,
  description,
  className,
}: ChartProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title || "Statistics"}</CardTitle>
        <CardDescription>
          {description || "Categorical breakdown"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-2">
        <ResponsiveContainer height={350} width="100%">
          <BarChart data={data}>
            <XAxis
              axisLine={false}
              dataKey="name"
              fontSize={12}
              stroke="#888888"
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              fontSize={12}
              stroke="#888888"
              tickFormatter={(value) => `${value}`}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "transparent" }}
            />
            <Bar dataKey="total" fill="#adfa1d" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

export function DistributionChart({
  data,
  title,
  description,
  className,
}: ChartProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title || "Distribution"}</CardTitle>
        <CardDescription>{description || "Proportional view"}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer height={300} width="100%">
          <PieChart>
            <Pie
              cx="50%"
              cy="50%"
              data={data}
              dataKey="value"
              fill="#8884d8"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
            >
              {data.map((entry) => (
                <Cell
                  fill={COLORS[data.indexOf(entry) % COLORS.length]}
                  key={entry.name || entry.value}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
