import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET - Get admin dashboard stats
export const GET = async () => {
  try {
    // Run all queries in parallel
    const [
      adminUsersResult,
      sophiaUsersResult,
      agentsResult,
      activeAgentsResult,
      messagesResult,
      telegramMessagesResult,
      leadsResult,
    ] = await Promise.all([
      supabase.from("admin_users").select("*", { count: "exact", head: true }),
      supabase
        .from("sophia_user_profiles")
        .select("*", { count: "exact", head: true }),
      supabase.from("agents").select("*", { count: "exact", head: true }),
      supabase
        .from("agents")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      supabase.from("chat_history").select("*", { count: "exact", head: true }),
      supabase
        .from("telegram_chat_history")
        .select("*", { count: "exact", head: true }),
      supabase.from("telegram_leads").select("*", { count: "exact", head: true }),
    ]);

    // Get daily message counts for last 7 days
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: recentMessages } = await supabase
      .from("chat_history")
      .select("created_at")
      .gte("created_at", sevenDaysAgo);

    // Group messages by day
    const dailyCounts: Record<string, number> = {};
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (const msg of recentMessages || []) {
      const date = new Date(msg.created_at);
      const dayName = days[date.getDay()];
      dailyCounts[dayName] = (dailyCounts[dayName] || 0) + 1;
    }

    const activityData = days.map((day) => ({
      name: day,
      total: dailyCounts[day] || 0,
    }));

    // Get top users by message count
    const { data: topUsers } = await supabase
      .from("sophia_user_profiles")
      .select("name, phone_number, total_messages, last_contact")
      .order("total_messages", { ascending: false })
      .limit(5);

    // Get regional distribution of agents
    const { data: agentsByRegion } = await supabase
      .from("agents")
      .select("region")
      .eq("is_active", true);

    const regionCounts: Record<string, number> = {};
    for (const agent of agentsByRegion || []) {
      regionCounts[agent.region] = (regionCounts[agent.region] || 0) + 1;
    }

    const regionalStats = Object.entries(regionCounts).map(
      ([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      })
    );

    return NextResponse.json({
      totalAdminUsers: adminUsersResult.count || 0,
      totalSophiaUsers: sophiaUsersResult.count || 0,
      totalAgents: agentsResult.count || 0,
      activeAgents: activeAgentsResult.count || 0,
      totalMessages: messagesResult.count || 0,
      totalTelegramMessages: telegramMessagesResult.count || 0,
      totalLeads: leadsResult.count || 0,
      activityData,
      topUsers: topUsers || [],
      regionalStats,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
};
