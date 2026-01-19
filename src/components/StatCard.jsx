import React from "react";
import { motion } from "framer-motion";

export default function StatCard({ label, value, subtext }) {
  return (
    <motion.div
      className="stat-card"
      whileHover={{ y: -5, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {subtext ? <div className="stat-subtext">{subtext}</div> : null}
    </motion.div>
  );
}
