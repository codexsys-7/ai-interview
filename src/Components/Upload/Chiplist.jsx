import { useState, useEffect, useRef, useMemo } from "react";

const colorStyles = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  green: "bg-green-100 text-green-700 border-green-200",
};

export default function ChipList({ items, color = "blue" }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <span
          key={index}
          className={`px-4 py-2 rounded-full text-sm font-medium border ${colorStyles[color]} transition-transform hover:scale-105`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
