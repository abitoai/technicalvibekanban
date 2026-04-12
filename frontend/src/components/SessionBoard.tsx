import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { fetchSessions, updateSessionMeta } from '../api';
import type { Repo, Session, ColumnStatus } from '../types';
import { COLUMNS, COLUMN_CONFIG } from '../types';
import SessionCard from './SessionCard';

interface Props {
  repo: Repo;
  skipPermissions: boolean;
  onResumed: (message: string) => void;
}

export default function SessionBoard({ repo, skipPermissions, onResumed }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(() => {
    setLoading(true);
    fetchSessions(repo.id)
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [repo.id]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const sessionsByColumn = useMemo(
    () =>
      COLUMNS.reduce(
        (acc, col) => {
          acc[col] = sessions.filter((s) => s.status === col);
          return acc;
        },
        {} as Record<ColumnStatus, Session[]>
      ),
    [sessions]
  );

  const totals = useMemo(() => {
    const total = sessions.length;
    const active = sessions.filter((s) => s.status === 'in_progress').length;
    return { total, active };
  }, [sessions]);

  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStatus = destination.droppableId as ColumnStatus;
    const session = sessions.find((s) => s.sessionId === draggableId);
    if (!session || session.status === newStatus) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.sessionId === draggableId ? { ...s, status: newStatus } : s
      )
    );
    await updateSessionMeta(draggableId, repo.id, { status: newStatus });
  };

  return (
    <div className="flex h-full flex-col py-5 pr-5">
      {/* ------------------ Editorial Header ------------------ */}
      <header className="relative mb-4 animate-fade-up">
        <div className="flex items-end justify-between gap-10">
          <div className="min-w-0 flex-1">
            <span className="eyebrow">Now viewing · Session board</span>
            <h2 className="text-display mt-4 truncate text-[3.25rem] font-medium leading-[0.9] text-espresso-900">
              <span className="gradient-text">{repo.name}</span>
            </h2>
            <p className="mt-3 font-serif text-[15px] italic text-espresso-500">
              {repo.path}
            </p>
          </div>

          {/* Stat constellation */}
          <div className="hidden shrink-0 items-stretch gap-3 md:flex">
            <StatTile label="Sessions" value={totals.total} />
            <StatTile label="In flight" value={totals.active} accent />
            <StatTile label="Columns" value={COLUMNS.length} />
          </div>
        </div>
      </header>

      {/* ------------------ Board ------------------ */}
      {loading ? (
        <BoardSkeleton />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="scrollbar-soft flex flex-1 gap-4 overflow-x-auto overflow-y-hidden pb-2 pr-1">
            {COLUMNS.map((col, idx) => {
              const cfg = COLUMN_CONFIG[col];
              const items = sessionsByColumn[col];
              return (
                <div
                  key={col}
                  className="flex h-full w-[340px] shrink-0 animate-fade-up flex-col"
                  style={{ animationDelay: `${idx * 70}ms` }}
                >
                  {/* Column: Double-bezel shell */}
                  <div className="bezel-shell flex h-full flex-col !p-[5px]">
                    <div className="bezel-core flex h-full flex-col overflow-hidden">
                      {/* Column header */}
                      <div className="flex items-center justify-between px-5 pt-5 pb-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-2.5 w-2.5 rounded-full shadow-[0_0_0_4px_rgba(42,30,23,0.04)]"
                            style={{ background: cfg.dot }}
                          />
                          <div>
                            <h3 className="font-serif text-[17px] font-medium tracking-tight text-espresso-900">
                              {cfg.label}
                            </h3>
                            <p className="mt-0.5 text-[11px] tracking-wide text-espresso-500">
                              {cfg.accent}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-full bg-espresso-900/5 px-2.5 py-1 font-mono text-[10px] tabular-nums text-espresso-600">
                          {items.length.toString().padStart(2, '0')}
                        </span>
                      </div>

                      {/* Hairline */}
                      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-espresso-900/10 to-transparent" />

                      {/* Droppable */}
                      <Droppable droppableId={col}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={[
                              'scrollbar-soft flex-1 space-y-3 overflow-y-auto px-3 pb-4 pt-3',
                              'transition-colors duration-500 ease-silk',
                              snapshot.isDraggingOver
                                ? 'bg-gradient-to-b from-ochre-soft/25 via-cream-50 to-cream-100'
                                : '',
                            ].join(' ')}
                          >
                            {items.length === 0 && !snapshot.isDraggingOver && (
                              <EmptyColumn />
                            )}

                            {items.map((session, index) => (
                              <Draggable
                                key={session.sessionId}
                                draggableId={session.sessionId}
                                index={index}
                              >
                                {(prov, snap) => (
                                  <div
                                    ref={prov.innerRef}
                                    {...prov.draggableProps}
                                    {...prov.dragHandleProps}
                                    className={[
                                      'transition-all duration-500 ease-silk',
                                      snap.isDragging
                                        ? 'rotate-[-1.2deg] scale-[1.02] shadow-soft-xl'
                                        : '',
                                    ].join(' ')}
                                    style={prov.draggableProps.style}
                                  >
                                    <SessionCard
                                      session={session}
                                      repoId={repo.id}
                                      skipPermissions={skipPermissions}
                                      onResumed={onResumed}
                                      onUpdate={loadSessions}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="bezel-shell !p-[4px]">
      <div
        className={[
          'bezel-core flex min-w-[100px] flex-col items-start px-4 py-3',
          accent ? 'bg-gradient-to-br from-cream-50 to-ochre-soft/40' : '',
        ].join(' ')}
      >
        <span className="text-[9px] font-medium uppercase tracking-eyebrow text-espresso-500">
          {label}
        </span>
        <span className="mt-1 font-serif text-2xl font-medium tabular-nums text-espresso-900">
          {value}
        </span>
      </div>
    </div>
  );
}

function EmptyColumn() {
  return (
    <div className="mt-2 rounded-2xl border border-dashed border-espresso-900/10 bg-cream-100/60 px-4 py-8 text-center">
      <p className="font-serif text-[13px] italic text-espresso-500">
        Nothing here yet.
      </p>
      <p className="mt-1 text-[11px] tracking-wide text-espresso-400">
        Drag a session across.
      </p>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-1 gap-4 overflow-hidden pb-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex h-full w-[340px] shrink-0 animate-fade-in flex-col"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="bezel-shell flex h-full flex-col !p-[5px]">
            <div className="bezel-core h-full space-y-3 p-5">
              <div className="h-4 w-24 rounded-full bg-espresso-900/5" />
              <div className="h-3 w-36 rounded-full bg-espresso-900/5" />
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((j) => (
                  <div
                    key={j}
                    className="h-24 rounded-2xl bg-gradient-to-r from-cream-200 via-cream-100 to-cream-200 bg-[length:200%_100%] animate-shimmer"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
