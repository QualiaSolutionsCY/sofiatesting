"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { MessageIcon, SparklesIcon } from "./icons";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty";

export function EmptyChatState() {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center"
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.5 }}
    >
      <EmptyState
        action={
          <div className="flex w-full max-w-sm flex-col gap-3">
            <Link href="/">
              <Button className="w-full" size="lg">
                <MessageIcon className="mr-2" size={16} />
                Start New Conversation
              </Button>
            </Link>
            <div className="text-center">
              <p className="mb-2 text-muted-foreground text-xs">
                Popular document types:
              </p>
              <div className="flex flex-wrap justify-center gap-1">
                <span className="rounded-md bg-muted px-2 py-1 text-xs">
                  Registrations
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-xs">
                  Marketing
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-xs">
                  Valuations
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-xs">
                  Viewing Forms
                </span>
              </div>
            </div>
          </div>
        }
        description="Your AI-powered assistant for Cyprus real estate document generation. Start a conversation to create professional documents instantly."
        icon={
          <div className="relative">
            <SparklesIcon className="text-primary" size={48} />
            <div className="-top-1 -right-1 absolute h-3 w-3 animate-pulse rounded-full bg-green-500" />
          </div>
        }
        title="Welcome to SOPHIA"
      />
    </motion.div>
  );
}
