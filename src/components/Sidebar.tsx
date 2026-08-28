import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r bg-white">
      <div className="flex h-full flex-col">

        {/* Logo */}
        <div className="flex h-16 items-center border-b px-6">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight"
          >
            KnowFlow
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 p-4">

          <Link
            href="/dashboard"
            className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <span className="mr-3 text-lg">
              📊
            </span>

            Dashboard
          </Link>

          <Link
            href="/"
            className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <span className="mr-3 text-lg">
              🏠
            </span>

            首页
          </Link>

          <Link
            href="/knowledge"
            className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <span className="mr-3 text-lg">
              📚
            </span>

            知识库
          </Link>

          <Link
            href="/import"
            className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            <span className="mr-3 text-lg">📥</span>
            导入知识
          </Link>

          <Link href="/system" className="flex items-center rounded-lg px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100">
            <span className="mr-3 text-lg">🩺</span>
            系统状态
          </Link>

        </nav>

        {/* Bottom */}
        <div className="border-t p-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">
              AI Knowledge System
            </p>

            <p className="mt-1 text-sm font-medium">
              KnowFlow
            </p>
          </div>
        </div>

      </div>
    </aside>
  );
}
