/**
 * Create Admin User Script
 *
 * This script creates an admin user with superadmin role.
 * Run with: npx tsx scripts/create-admin-user.ts <email>
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { adminUserRole, user } from "@/lib/db/schema";

async function createAdminUser(userEmail: string) {
  try {
    console.log(`🔍 Looking for user with email: ${userEmail}`);

    // Find user by email
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.email, userEmail))
      .limit(1);

    if (!existingUser || existingUser.length === 0) {
      console.error(`❌ User with email ${userEmail} not found.`);
      console.log("\n💡 Please register an account first at /register");
      process.exit(1);
    }

    const foundUser = existingUser[0];
    console.log(`✅ Found user: ${foundUser.email} (${foundUser.id})`);

    // Check if already admin (by email in admin_users table)
    const existingAdmin = await db
      .select()
      .from(adminUserRole)
      .where(eq(adminUserRole.email, foundUser.email))
      .limit(1);

    if (existingAdmin && existingAdmin.length > 0) {
      console.log(
        `⚠️  User is already an admin with role: ${existingAdmin[0].role}`
      );
      console.log("\nUpdating to superadmin...");

      await db
        .update(adminUserRole)
        .set({
          role: "superadmin",
          permissions: {
            agents: { view: true, create: true, edit: true, delete: true },
            health: { view: true },
            integrations: { view: true, edit: true },
            settings: { view: true, edit: true },
            users: { view: true, create: true, edit: true, delete: true },
            whatsapp: { view: true, edit: true },
          },
        })
        .where(eq(adminUserRole.email, foundUser.email));

      console.log("✅ Updated to superadmin!");
    } else {
      console.log("\n🔧 Creating superadmin role...");

      await db.insert(adminUserRole).values({
        email: foundUser.email,
        name: foundUser.email,
        role: "superadmin",
        permissions: {
          agents: { view: true, create: true, edit: true, delete: true },
          health: { view: true },
          integrations: { view: true, edit: true },
          settings: { view: true, edit: true },
          users: { view: true, create: true, edit: true, delete: true },
          whatsapp: { view: true, edit: true },
        },
      });

      console.log("✅ Superadmin role created!");
    }

    console.log("\n🎉 Success!");
    console.log("\n📋 Admin Details:");
    console.log(`   Email: ${foundUser.email}`);
    console.log(`   User ID: ${foundUser.id}`);
    console.log("   Role: superadmin");
    console.log("\n🔗 You can now access the admin panel at:");
    console.log("   http://localhost:3000/admin");
    console.log("   http://localhost:3000/admin/agents-registry");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.error("❌ Please provide an email address");
  console.log("\nUsage: npx tsx scripts/create-admin-user.ts <email>");
  console.log("Example: npx tsx scripts/create-admin-user.ts admin@zyprus.com");
  process.exit(1);
}

createAdminUser(email);
