import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { hasScope, OAuthScopes } from "@sis/shared";
import { api } from "../api";

export function StudentListPage() {
  // searchInput is what's typed; search is the debounced term that drives the query.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const term = searchInput.trim();
    const timer = setTimeout(() => {
      setSearch(term);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.getMe,
  });
  const scopes = me?.data.scopes ?? [];
  const canWrite =
    hasScope(scopes, OAuthScopes.STUDENTS_WRITE) || hasScope(scopes, OAuthScopes.ADMIN);
  const canSeeAcademic = hasScope(scopes, OAuthScopes.STUDENTS_ACADEMIC) || hasScope(scopes, OAuthScopes.ADMIN);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["students", page, search],
    queryFn: () => api.listStudents({ page, limit: 20, search: search || undefined }),
    // Keep the table (and the search box) mounted while a new search loads; replacing the
    // page with the loading screen unmounted the input and dropped focus on every keystroke.
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteStudent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["students"] }),
  });

  if (isLoading && !data) return <div className="loading-screen">Loading students…</div>;
  if (error && !data) return <div className="container"><div className="error">{(error as Error).message}</div></div>;

  const { data: students, meta } = data!;

  return (
    <div className="container">
      <div className="card">
        <div className="page-header">
          <h1>Students</h1>
          {canWrite && (
            <Link className="btn btn-primary" to="/admin/students/new">
              Add Student
            </Link>
          )}
        </div>

        <form
          className="search-bar"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <input
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button className="btn btn-secondary" type="submit" disabled={isFetching}>
            {isFetching ? "Searching…" : "Search"}
          </button>
        </form>
        {error && <div className="error">{(error as Error).message}</div>}

        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              {canSeeAcademic && <th>Classes</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.firstName} {s.lastName}
                </td>
                <td>{s.email}</td>
                <td>{s.enrollmentStatus ? "Enrolled" : "Not enrolled"}</td>
                {canSeeAcademic && <td>{s.enrolledClasses?.join(", ") || "—"}</td>}
                <td className="actions">
                  <Link className="btn btn-primary btn-sm" to={`/admin/students/${s.id}`}>
                    View
                  </Link>
                  {canWrite && (
                    <>
                      <Link className="btn btn-secondary btn-sm" to={`/admin/students/${s.id}/edit`}>
                        Edit
                      </Link>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          if (confirm(`Delete ${s.firstName} ${s.lastName}?`)) {
                            deleteMutation.mutate(s.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="pagination">
          <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </span>
          <button
            className="btn btn-secondary"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
