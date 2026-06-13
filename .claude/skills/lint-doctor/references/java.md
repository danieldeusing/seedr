# Java Linting

## Tool Choice

| Tool | Purpose |
|------|---------|
| Checkstyle | Style enforcement (Google Java Style) |
| SpotBugs | Bug detection |
| PMD | Code quality rules |

## Maven Setup

### pom.xml

```xml
<build>
  <plugins>
    <!-- Checkstyle -->
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-checkstyle-plugin</artifactId>
      <version>3.3.1</version>
      <configuration>
        <configLocation>google_checks.xml</configLocation>
        <consoleOutput>true</consoleOutput>
        <failsOnError>true</failsOnError>
        <violationSeverity>warning</violationSeverity>
      </configuration>
      <executions>
        <execution>
          <goals><goal>check</goal></goals>
        </execution>
      </executions>
    </plugin>

    <!-- SpotBugs -->
    <plugin>
      <groupId>com.github.spotbugs</groupId>
      <artifactId>spotbugs-maven-plugin</artifactId>
      <version>4.8.3.1</version>
      <configuration>
        <effort>Max</effort>
        <threshold>Medium</threshold>
      </configuration>
    </plugin>

    <!-- PMD -->
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-pmd-plugin</artifactId>
      <version>3.21.2</version>
      <configuration>
        <rulesets>
          <ruleset>/category/java/bestpractices.xml</ruleset>
          <ruleset>/category/java/errorprone.xml</ruleset>
          <ruleset>/category/java/codestyle.xml</ruleset>
        </rulesets>
      </configuration>
    </plugin>
  </plugins>
</build>
```

## Gradle Setup

### build.gradle.kts

```kotlin
plugins {
    id("checkstyle")
    id("pmd")
    id("com.github.spotbugs") version "6.0.7"
}

checkstyle {
    toolVersion = "10.14.0"
    configFile = file("config/checkstyle/google_checks.xml")
    isIgnoreFailures = false
}

pmd {
    toolVersion = "7.0.0"
    ruleSets = listOf(
        "category/java/bestpractices.xml",
        "category/java/errorprone.xml"
    )
}

spotbugs {
    effort.set(com.github.spotbugs.snom.Effort.MAX)
    reportLevel.set(com.github.spotbugs.snom.Confidence.MEDIUM)
}
```

## Google Java Style (google_checks.xml)

Download from: https://github.com/checkstyle/checkstyle/blob/master/src/main/resources/google_checks.xml

Place in project root or `config/checkstyle/`.

## Strictness Levels

### Relaxed
```xml
<property name="severity" value="warning"/>
<property name="max" value="150"/>  <!-- line length -->
```

SpotBugs: `<threshold>High</threshold>`

### Moderate (Default)
Use Google defaults with severity=warning for style, error for bugs.

### Strict
```xml
<property name="severity" value="error"/>
<property name="max" value="100"/>
```

SpotBugs: `<threshold>Low</threshold>`
PMD: Add `<failOnViolation>true</failOnViolation>`

## Commands

Maven:
```bash
mvn checkstyle:check
mvn spotbugs:check
mvn pmd:check
```

Gradle:
```bash
./gradlew checkstyleMain
./gradlew spotbugsMain
./gradlew pmdMain
```
