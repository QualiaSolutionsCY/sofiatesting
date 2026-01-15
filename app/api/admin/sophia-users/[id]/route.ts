import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET - Get single user with conversation history
export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    // Get user profile
    const { data: user, error: userError } = await supabase
      .from("sophia_user_profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // Get conversation history
    const { data: conversations, error: convError } = await supabase
      .from("sophia_conversation_memory")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (convError) {
      console.error("Error fetching conversations:", convError);
    }

    return NextResponse.json({
      user,
      conversations: conversations || [],
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
};

// DELETE - Delete user and their conversations
export const DELETE = async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    // First delete conversation memory
    const { error: convError } = await supabase
      .from("sophia_conversation_memory")
      .delete()
      .eq("user_id", id);

    if (convError) {
      console.error("Error deleting conversations:", convError);
    }

    // Then delete the user profile
    const { error } = await supabase
      .from("sophia_user_profiles")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
};
