import { motion } from "framer-motion";
import { GlobeIcon, SparklesIcon } from "./icons";
import { Badge } from "./ui/badge";

export const Greeting = () => {
  return (
    <div
      className="mx-auto mt-4 flex size-full max-w-3xl flex-col items-center justify-center px-4 text-center md:mt-16 md:px-8"
      key="overview"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-center gap-2"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.3 }}
      >
        <div className="relative">
          <SparklesIcon className="text-primary" size={24} />
          <div className="-top-1 -right-1 absolute h-2 w-2 animate-pulse rounded-full bg-green-500" />
        </div>
        <h1 className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text font-bold text-2xl text-transparent md:text-3xl">
          Welcome to SOPHIA
        </h1>
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 text-lg text-muted-foreground"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.4 }}
      >
        Your AI-powered assistant for Cyprus real estate
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-wrap justify-center gap-2"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
      >
        <Badge className="gap-1" variant="secondary">
          <GlobeIcon size={12} />
          Cyprus Focused
        </Badge>
        <Badge variant="secondary">40+ Document Types</Badge>
        <Badge variant="secondary">Professional Templates</Badge>
        <Badge variant="secondary">Instant Generation</Badge>
      </motion.div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="text-muted-foreground text-sm"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
      >
        Powered by Qualia Solutions
      </motion.div>
    </div>
  );
};
