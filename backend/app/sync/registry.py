"""Maps sync entity names to their ORM model and Pydantic schema."""

from dataclasses import dataclass

from app import models, schemas


@dataclass(frozen=True)
class EntitySpec:
    name: str
    model: type
    schema: type[schemas.SyncRecord]

    @property
    def data_fields(self) -> tuple[str, ...]:
        """Entity-specific fields copied from a pushed record onto the row."""
        base = set(schemas.SyncRecord.model_fields)
        return tuple(f for f in self.schema.model_fields if f not in base)


REGISTRY: dict[str, EntitySpec] = {
    spec.name: spec
    for spec in (
        EntitySpec("tasks", models.Task, schemas.TaskRecord),
        EntitySpec("habits", models.Habit, schemas.HabitRecord),
        EntitySpec("habit_logs", models.HabitLog, schemas.HabitLogRecord),
        EntitySpec("notes", models.Note, schemas.NoteRecord),
        EntitySpec("lists", models.OrbitList, schemas.ListRecord),
        EntitySpec("list_items", models.ListItem, schemas.ListItemRecord),
    )
}


def get_spec(entity: str) -> EntitySpec:
    try:
        return REGISTRY[entity]
    except KeyError as exc:
        raise ValueError(f"unknown entity '{entity}'") from exc


def to_record(spec: EntitySpec, row) -> dict:
    return spec.schema.model_validate(row).model_dump()
