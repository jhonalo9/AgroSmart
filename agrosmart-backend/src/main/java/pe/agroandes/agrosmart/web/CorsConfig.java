package pe.agroandes.agrosmart.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Permite que el dashboard Angular (localhost:4200) consuma la API. */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String origin;

    public CorsConfig(@Value("${agrosmart.cors.origin}") String origin) {
        this.origin = origin;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins(origin).allowedMethods("GET", "POST");
    }
}
