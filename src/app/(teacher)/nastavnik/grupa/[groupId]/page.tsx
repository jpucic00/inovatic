import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Upravljanje grupom" }

export default async function TeacherGroupPage({ params }: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const { groupId } = await params
  return (
    <div>
      <Link href="/nastavnik" className="text-sm text-cyan-500 hover:underline mb-4 inline-block">← Natrag</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Upravljanje grupom</h1>
      <p className="text-gray-400 italic">Stranica u izradi. ID grupe: {groupId}</p>
    </div>
  )
}
