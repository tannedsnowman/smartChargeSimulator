import type { MetaFunction } from "@remix-run/node";
import Dashboard from "./dashboard";

export const meta: MetaFunction = () => {
  return [
    { title: "Energy Management App" },
    { name: "description", content: "Welcome to the Energy Management App" },
  ];
};

export default function Index() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Welcome to Energy Management</h1>
      <Dashboard />
    </div>
  );
}
