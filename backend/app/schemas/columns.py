from typing import Literal

from pydantic import BaseModel

# Ordre d'inclusion : un booléen 0/1 est aussi un entier, un entier aussi un décimal,
# et tout s'écrit en texte. La détection retient le type le plus précis.
ColumnType = Literal["boolean", "integer", "float", "string"]


class ColumnOut(BaseModel):
    label: str
    key: str
    type: ColumnType


class TypeChange(BaseModel):
    type: ColumnType


class TypeCheck(BaseModel):
    invalid_count: int
    # Trois valeurs au plus : assez pour que l'utilisateur retrouve le problème dans son fichier.
    examples: list[str]
