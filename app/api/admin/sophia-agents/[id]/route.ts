import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET - Get single agent with activity details
export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    // Get agent details
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (agentError) {
      return NextResponse.json({ error: agentError.message }, { status: 500 });
    }

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get recent chat history for this agent's phone number
    const { data: chatHistory, error: chatError } = await supabase
      .from("chat_history")
      .select("*")
      .eq("user_id", agent.mobile)
      .order("created_at", { ascending: false })
      .limit(50);

    if (chatError) {
      console.error("Error fetching chat history:", chatError);
    }

    // Get leads assigned to this agent
    const { data: leads, error: leadsError } = await supabase
      .from("telegram_leads")
      .select("*")
      .eq("forwarded_to_agent_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
    }

    return NextResponse.json({
      agent,
      chatHistory: chatHistory || [],
      leads: leads || [],
      stats: {
        totalMessages: chatHistory?.length || 0,
        totalLeads: leads?.length || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching agent:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent" },
      { status: 500 }
    );
  }
};

// PATCH - Update agent
export const PATCH = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const body = await request.json();

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};

    if (body.full_name !== undefined) updateData.full_name = body.full_name;
    if (body.mobile !== undefined) updateData.mobile = body.mobile;
    if (body.communication_email !== undefined)
      updateData.communication_email = body.communication_email;
    if (body.listing_owner_email !== undefined)
      updateData.listing_owner_email = body.listing_owner_email || null;
    if (body.region !== undefined) updateData.region = body.region;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.can_upload !== undefined) updateData.can_upload = body.can_upload;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.can_receive_leads !== undefined)
      updateData.can_receive_leads = body.can_receive_leads;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: agent, error } = await supabase
      .from("agents")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating agent:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error("Error updating sophia agent:", error);
    return NextResponse.json(
      { error: "Failed to update agent" },
      { status: 500 }
    );
  }
};

// DELETE - Remove agent
export const DELETE = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    // Check if agent has any assigned leads first
    const { data: leads } = await supabase
      .from("telegram_leads")
      .select("id")
      .eq("forwarded_to_agent_id", id)
      .limit(1);

    if (leads && leads.length > 0) {
      // Soft delete by deactivating instead of hard delete
      const { error } = await supabase
        .from("agents")
        .update({ is_active: false })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Agent deactivated (has existing leads)",
      });
    }

    // Hard delete if no leads
    const { error } = await supabase.from("agents").delete().eq("id", id);

    if (error) {
      console.error("Error deleting agent:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting sophia agent:", error);
    return NextResponse.json(
      { error: "Failed to delete agent" },
      { status: 500 }
    );
  }
};
