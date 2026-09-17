class NotFoundError(Exception):
    pass


class ConflictError(Exception):
    pass


class InvalidError(Exception):
    pass


class FieldErrors(InvalidError):
    """Valeurs refusées, avec un message par champ."""

    def __init__(self, errors: dict[str, str]) -> None:
        super().__init__("Certaines valeurs sont invalides")
        self.errors = errors
