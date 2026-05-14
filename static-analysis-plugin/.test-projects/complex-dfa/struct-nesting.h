#ifndef STRUCT_NESTING_H
#define STRUCT_NESTING_H

#include <string>

struct Project {
    struct Module {
        struct File {
            int loc;
            std::string path;
            bool is_main;
        };
        std::string name;
        File files[10];
        int file_count;
    };
    std::string name;
    Module modules[5];
    int module_count;
};

struct Config {
    struct Server {
        struct Endpoint {
            std::string url;
            int timeout_ms;
        };
        std::string host;
        int port;
        Endpoint endpoints[3];
        int endpoint_count;
    };
    Server server;
    bool enabled;
};

Project createProject();
Config createConfig();
Module* findModule(Project& p, const std::string& name);
int countFiles(const Module& m);
File* findFile(Module& m, const std::string& path);
int totalLinesOfCode(const Project& p);
void printProjectStats(const Project& p);

#endif