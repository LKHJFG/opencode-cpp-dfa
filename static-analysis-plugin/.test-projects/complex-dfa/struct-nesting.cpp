#include "struct-nesting.h"
#include <iostream>
#include <cstring>

Project createProject() {
    Project proj;
    proj.name = "TestProject";
    proj.module_count = 2;
    proj.modules[0].name = "core";
    proj.modules[0].file_count = 3;
    proj.modules[0].files[0].loc = 100;
    proj.modules[0].files[0].path = "core/main.cpp";
    proj.modules[0].files[0].is_main = true;
    proj.modules[0].files[1].loc = 200;
    proj.modules[0].files[1].path = "core/utils.cpp";
    proj.modules[0].files[1].is_main = false;
    proj.modules[1].name = "lib";
    proj.modules[1].file_count = 2;
    proj.modules[1].files[0].loc = 150;
    proj.modules[1].files[0].path = "lib/api.cpp";
    proj.modules[1].files[0].is_main = false;
    return proj;
}

Config createConfig() {
    Config cfg;
    cfg.enabled = true;
    cfg.server.host = "localhost";
    cfg.server.port = 8080;
    cfg.server.endpoint_count = 2;
    cfg.server.endpoints[0].url = "/api/v1";
    cfg.server.endpoints[0].timeout_ms = 5000;
    cfg.server.endpoints[1].url = "/api/v2";
    cfg.server.endpoints[1].timeout_ms = 3000;
    return cfg;
}

Module* findModule(Project& p, const std::string& name) {
    for (int i = 0; i < p.module_count; i++) {
        if (p.modules[i].name == name) {
            return &p.modules[i];
        }
    }
    return nullptr;
}

int countFiles(const Module& m) {
    return m.file_count;
}

File* findFile(Module& m, const std::string& path) {
    for (int i = 0; i < m.file_count; i++) {
        if (m.files[i].path == path) {
            return &m.files[i];
        }
    }
    return nullptr;
}

int totalLinesOfCode(const Project& p) {
    int total = 0;
    for (int i = 0; i < p.module_count; i++) {
        for (int j = 0; j < p.modules[i].file_count; j++) {
            total += p.modules[i].files[j].loc;
        }
    }
    return total;
}

void printProjectStats(const Project& p) {
    int total_files = 0;
    int total_loc = totalLinesOfCode(p);
    for (int i = 0; i < p.module_count; i++) {
        total_files += p.modules[i].file_count;
    }
    std::cout << "Project: " << p.name << "\n";
    std::cout << "Modules: " << p.module_count << "\n";
    std::cout << "Files: " << total_files << "\n";
    std::cout << "Total LoC: " << total_loc << "\n";
}

int main() {
    Project proj = createProject();
    Module* core = findModule(proj, "core");
    int core_file_count = countFiles(*core);
    int file_loc = core->files[0].loc;
    proj.modules[0].files[2].loc = 150;
    File* main_file = findFile(*core, "core/main.cpp");
    if (main_file != nullptr) {
        main_file->is_main = true;
    }
    Module* lib = findModule(proj, "lib");
    if (lib != nullptr) {
        lib->files[1].loc = 300;
    }
    int total = totalLinesOfCode(proj);
    printProjectStats(proj);
    return total + core_file_count + file_loc;
}