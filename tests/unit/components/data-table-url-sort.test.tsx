import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/ucenici',
  useSearchParams: () => new URLSearchParams('search=ana&page=2'),
}))

type Row = { id: string; name: string }

const columns: ColumnDef<Row>[] = [
  { key: 'name', header: 'Ime', sortable: true, cell: (r) => r.name },
  { key: 'note', header: 'Napomena', cell: () => '' },
]

const rows: Row[] = [
  { id: '1', name: 'Zara' },
  { id: '2', name: 'Ana' },
]

describe('DataTable with a URL sort (paginated lists)', () => {
  it('renders rows in the order the server sent, never re-sorting one page', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        urlSort={{ current: { key: 'name', dir: 'asc' } }}
      />,
    )
    const cells = screen.getAllByRole('cell').map((c) => c.textContent)
    expect(cells.filter(Boolean)).toEqual(['Zara', 'Ana'])
  })

  it('links the header to the next sort, keeping filters and dropping the page', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        urlSort={{ current: { key: 'name', dir: 'asc' } }}
      />,
    )
    const link = screen.getByRole('link', { name: /Ime/ })
    expect(link.getAttribute('href')).toBe('/admin/ucenici?search=ana&sort=name&dir=desc')
    expect(screen.getByRole('columnheader', { name: /Ime/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    )
    expect(screen.queryByRole('link', { name: /Napomena/ })).toBeNull()
  })
})
