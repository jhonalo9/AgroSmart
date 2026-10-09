package pe.agroandes.agrosmart.chat;

public class LlmException extends RuntimeException {
    public LlmException(String mensaje) { super(mensaje); }
    public LlmException(String mensaje, Throwable causa) { super(mensaje, causa); }
}
