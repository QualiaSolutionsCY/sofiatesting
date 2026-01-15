import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET - List all WhatsApp agents with upload stats
export const GET = async () => {
  try {
    // Fetch all agents from the `agents` table (Supabase)
    const { data: agents, error: agentsError } = await supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (agentsError) {
      console.error("Error fetching agents:", agentsError);
      return NextResponse.json({ error: agentsError.message }, { status: 500 });
    }

    // Fetch upload stats per agent from chat_history
    // We count messages that have tool calls related to uploads
    const { data: chatStats } = await supabase
      .from("chat_history")
      .select("user_id, role, parts, created_at")
      .order("created_at", { ascending: false });

    // Process stats per agent based on phone number (user_id in chat_history is the phone number)
    const uploadStats = agents?.map((agent) => {
      const agentMessages = chatStats?.filter(
        (msg) => msg.user_id === agent.mobile
      ) || [];

      // Count uploads by looking for specific patterns in assistant messages
      const uploadMessages = agentMessages.filter((msg) => {
        if (msg.role !== "assistant") return false;
        const partsStr = JSON.stringify(msg.parts);
        return (
          partsStr.includes("uploadListing") ||
          partsStr.includes("createListing") ||
          partsStr.includes("uploaded successfully") ||
          partsStr.includes("property has been uploaded")
        );
      });

      const successfulUploads = uploadMessages.filter((msg) => {
        const partsStr = JSON.stringify(msg.parts);
        return (
          partsStr.includes("uploaded successfully") ||
          partsStr.includes("property has been uploaded") ||
          partsStr.includes("listing has been created")
        );
      }).length;

      const failedUploads = uploadMessages.filter((msg) => {
        const partsStr = JSON.stringify(msg.parts);
        return (
          partsStr.includes("failed to upload") ||
          partsStr.includes("error uploading") ||
          partsStr.includes("upload failed")
        );
      }).length;

      return {
        agent_id: agent.id,
        agent_name: agent.full_name,
        total_uploads: uploadMessages.length,
        successful_uploads: successfulUploads,
        failed_uploads: failedUploads,
        last_upload_at: uploadMessages[0]?.created_at || null,
        upload_history: uploadMessages.slice(0, 5).map((msg) => ({
          id: msg.user_id,
          property_name: "Property",
          status: JSON.stringify(msg.parts).includes("success")
            ? "success"
            : "pending",
          created_at: msg.created_at,
        })),
      };
    }) || [];

    return NextResponse.json({
      agents: agents || [],
      uploadStats: uploadStats.filter((s) => s.total_uploads > 0),
    });
  } catch (error) {
    console.error("Error fetching sophia agents:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
};

// POST - Create a new agent
export const POST = async (request: NextRequest) => {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.full_name || !body.mobile || !body.communication_email) {
      return NextResponse.json(
        { error: "Missing required fields: full_name, mobile, communication_email" },
        { status: 400 }
      );
    }

    // Check if agent with same mobile already exists
    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .eq("mobile", body.mobile)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Agent with this mobile number already exists" },
        { status: 409 }
      );
    }

    // Insert new agent
    const { data: agent, error } = await supabase
      .from("agents")
      .insert({
        full_name: body.full_name,
        mobile: body.mobile,
        communication_email: body.communication_email,
        listing_owner_email: body.listing_owner_email || null,
        region: body.region || "limassol",
        role: body.role || "agent",
        can_upload: body.can_upload ?? true,
        is_active: body.is_active ?? true,
        can_receive_leads: body.can_receive_leads ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating agent:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("Error creating sophia agent:", error);
    return NextResponse.json(
      { error: "Failed to create agent" },
      { status: 500 }
    );
  }
};
