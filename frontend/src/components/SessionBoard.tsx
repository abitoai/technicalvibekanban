import { useState, useEffect, useCallback } from 'react';
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

  const sessionsByColumn = COLUMNS.reduce(
    (acc, col) => {
      acc[col] = sessions.filter((s) => s.status === col);
      return acc;
    },
    {} as Record<ColumnStatus, Session[]>
  );

  const handleDragEnd = async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;

    const newStatus = destination.droppableId as ColumnStatus;
    const session = sessions.find((s) => s.sessionId === draggableId);
    if (!session || session.status === newStatus) return;

    // Optimistic update
    setSessions((prev) =>
      prev.map((s) =>
        s.sessionId === draggableId ? { ...s, status: newStatus } : s
      )
    );

    await updateSessionMeta(draggableId, repo.id, { status: newStatus });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading sessions...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-gray-800">
        <h2 className="text-xl font-bold text-white">{repo.name}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{repo.path}</p>
      </header>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-x-auto p-4 gap-4">
          {COLUMNS.map((col) => (
            <div
              key={col}
              className="flex-shrink-0 w-72 flex flex-col bg-gray-900 rounded-xl"
            >
              <div className="flex items-center gap-2 px-4 py-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${COLUMN_CONFIG[col].color}`}
                />
                <h3 className="text-sm font-semibold text-gray-300">
                  {COLUMN_CONFIG[col].label}
                </h3>
                <span className="text-xs text-gray-600 ml-auto">
                  {sessionsByColumn[col].length}
                </span>
              </div>

              <Droppable droppableId={col}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[100px] transition-colors ${
                      snapshot.isDraggingOver
                        ? 'bg-gray-800/50 rounded-b-xl'
                        : ''
                    }`}
                  >
                    {sessionsByColumn[col].map((session, index) => (
                      <Draggable
                        key={session.sessionId}
                        draggableId={session.sessionId}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={
                              snapshot.isDragging ? 'opacity-90 rotate-1' : ''
                            }
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
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
