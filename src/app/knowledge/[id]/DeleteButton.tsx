"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteKnowledge } from "@/app/actions/knowledge";

type Props = {
  id: number;
};

export default function DeleteButton({ id }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const confirmed = window.confirm(
      "确定要删除这条知识吗？"
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      await deleteKnowledge(id);
      router.push("/");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? "删除中..." : "删除知识"}
    </button>
  );
}